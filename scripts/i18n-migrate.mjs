#!/usr/bin/env node
// Mechanical i18n migration for agent-written pages (one-time, run by the
// Klar update flow — not part of the normal build).
//
// The conversion of hardcoded UI literals to the makeT contract is almost
// entirely mechanical, so an agent loop (one API round-trip per edit, ~25
// edits = 4-5 min) is the wrong tool. Every finding is recorded as a byte
// span; the texts go out as ONE translation batch; the spans come back
// replaced. The offsets ARE the markers — nothing is written into the source
// between the two phases, so a failed run leaves the file untouched.
//
//   extract <files...>  — TypeScript-AST scan. Writes .i18n-texts.json with
//                         the texts to translate plus `residues`: the few
//                         findings that need judgment (file:line).
//   apply <files...>    — reads .i18n-translations.json ({source, map}),
//                         performs the same scan and rewrites every span.
//
// What it converts, all deterministically:
//   • JSX text, allowlisted attributes and object props (the gate-21 surface)
//   • `?? 'Fallback'` / `|| 'Fallback'` and human-looking call arguments
//   • string ternaries      n === 1 ? 'Tier' : 'Tiere'
//         →  n === 1 ? tt('tier') : tt('tiere')
//   • template literals, expanded over their inner string ternaries so each
//     variant is a FULL sentence the translator can handle:
//         `${n} Tier${n === 1 ? '' : 'e'} im System`
//         →  n === 1 ? tt('n_tier_im_system', { p0: n })
//                    : tt('n_tiere_im_system', { p0: n })
//     ({p0} placeholders; the expressions move into the params object)
//   • module-scope consts holding labels (WIZARD_STEPS, COLUMNS — the gate-22
//     trap) are moved INTO the component that uses them, then converted
//     normally. Only when the const is not exported and every reference lives
//     in one component.
//
// A file that already has a makeT table is merged into (new keys are added to
// every language row) instead of being skipped — so re-running the migration
// on an already-converted dashboard converges instead of colliding.
//
// Deliberately left alone: anything inside className/cn(), css-shaped tokens,
// lines carrying /* i18n-exempt */, and template literals too branchy to
// expand (>4 variants) — those are reported as residues.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
// typescript is CJS; default-import interop breaks on some node/ts combos.
const ts = createRequire(import.meta.url)('typescript');

const ATTRS = new Set([
  'title', 'placeholder', 'label', 'aria-label', 'alt', 'emptyLabel',
  'emptyText', 'searchPlaceholder', 'createLabel', 'subtitle', 'description',
]);
const PROPS = new Set([
  'title', 'label', 'name', 'emptyLabel', 'emptyText', 'hint', 'description',
  'text', 'subtitle',
  // An agent abbreviates as it pleases — `desc` cost a whole fixer run while
  // its sibling `title` converted. Unknown names still surface as residue
  // below, so this list only decides who is converted WITHOUT being asked.
  'desc', 'caption', 'summary', 'heading', 'subheading', 'sublabel',
  'helper', 'helperText', 'message', 'msg', 'body', 'tooltip', 'note',
]);
// Key names that would themselves match gate 21's objText pattern inside the
// generated tt table — suffix them so the table never re-triggers the gate.
const RESERVED = new Set([...PROPS, 'placeholder', 'alt']);
// Callees whose string arguments are class lists, not copy.
const CN_CALLEES = new Set(['cn', 'clsx', 'cva', 'twMerge', 'classNames']);
// Callees whose string arguments are never user-facing copy.
const SKIP_CALLEE = /^console\.|^(tt|t|tp|require|import|format|formatDate|formatDateTime|parse|parseISO|lookupKey)$/;
// Callees whose string arguments ARE copy — a single word is safe there.
const COPY_CALLEE = /toast|^(alert|confirm)$|^window\.(alert|confirm)$/i;
// date-fns / Intl pattern strings ('dd. MMMM yyyy') read as prose otherwise.
const DATE_PATTERN = /^[dDMyYhHmsSaAZzEwWQXx'.:,\/\- ]+$/;

const TEXTS_FILE = '.i18n-texts.json';
const TRANSLATIONS_FILE = '.i18n-translations.json';
const HAS_LETTER = /[A-Za-zÀ-ž]{2,}/;
// A whitespace-separated token that could plausibly be a Tailwind class,
// URL segment or key — all-lowercase ASCII plus css punctuation.
const CSSISH_TOKEN = /^[a-z0-9\-_:\/\[\]().%#,&>*!'"@=+]+$/;
const PARAM = '\u0001';        // placeholder marker inside an expanded text
const MAX_VARIANTS = 4;        // cap on template-literal ternary expansion

const isIntentsFile = (p) => /config\/intents\.ts$/.test(p);
const esc = (s) => s
  .replace(/\\/g, '\\\\')
  .replace(/'/g, "\\'")
  .replace(/\n/g, '\\n')
  .replace(/\r/g, '\\r');

// Human copy vs. code-ish string: umlauts, a Capitalized word, or two-plus
// words that are not all css-shaped.
function looksHuman(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!HAS_LETTER.test(t)) return false;
  if (/[À-ž]/.test(t)) return true;
  if (/(^|[^A-Za-z0-9_])[A-Z][a-zà-ž]/.test(t)) return true;
  const words = t.split(' ').filter((w) => /[A-Za-z]{2,}/.test(w));
  // CSSISH_TOKEN accepts ANY all-lowercase token, so a German phrase without
  // an umlaut and without a capitalised noun ('— sofort handeln!') read as a
  // list of class names and was dropped without a word — the sentence stayed
  // German on an English page (live-seen, Bauhof hero line). Real class lists
  // carry a structural marker somewhere: a hyphen, colon, slash, bracket or
  // digit. Prose does not.
  const cssish = words.every((w) => CSSISH_TOKEN.test(w)) &&
    words.some((w) => /[-:/\[\]0-9]/.test(w));
  return words.length >= 2 && !cssish;
}

function enclosingFunction(node) {
  for (let p = node.parent; p; p = p.parent) {
    if (
      ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) || ts.isMethodDeclaration(p)
    ) return p;
  }
  return null;
}

function outermostFunction(node) {
  let found = null;
  for (let p = node.parent; p; p = p.parent) {
    if (
      ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) || ts.isMethodDeclaration(p)
    ) found = p;
  }
  return found;
}

function inClassNameContext(node, sf) {
  for (let p = node.parent; p; p = p.parent) {
    if (ts.isJsxAttribute(p)) return /class/i.test(p.name.getText(sf));
    if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && CN_CALLEES.has(p.expression.text)) return true;
    if (
      ts.isFunctionDeclaration(p) || ts.isFunctionExpression(p) ||
      ts.isArrowFunction(p) || ts.isMethodDeclaration(p)
    ) return false;
  }
  return false;
}

function lineOf(source, pos) {
  return source.slice(source.lastIndexOf('\n', pos) + 1, source.indexOf('\n', pos));
}

// ── module-scope const hoisting ─────────────────────────────────────
// A const at module scope whose value carries UI labels freezes them at
// import time (gate 22). When it is used by exactly one component we can move
// the whole declaration into that component's body — a pure code motion.

function collectHoists(sf, source) {
  const hoists = [];
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    if (stmt.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
    const decl = stmt.declarationList.declarations[0];
    if (!decl || !ts.isIdentifier(decl.name) || !decl.initializer) continue;

    const declText = stmt.getText(sf);
    // The makeT table itself must stay at module scope — the runtime, the
    // gates and the overlay extractor all expect it there.
    if (/\bmakeT\s*\(/.test(declText)) continue;
    const carriesLabels =
      /\blabel\s*:/.test(declText) ||
      (/LOOKUP_OPTIONS/.test(declText) && /\.label\b/.test(declText)) ||
      hasHumanLiteral(decl.initializer, sf);
    if (!carriesLabels) continue;
    if (declText.includes('i18n-exempt')) continue;

    // Every reference must live inside one and the same component.
    const name = decl.name.text;
    let target = null;
    let ok = true;
    const visit = (n) => {
      if (ts.isIdentifier(n) && n.text === name && n !== decl.name) {
        const fn = outermostFunction(n);
        if (!fn || !fn.body || !ts.isBlock(fn.body)) ok = false;
        else if (target && target !== fn) ok = false;
        else target = fn;
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
    if (!ok || !target) continue;

    hoists.push({
      start: stmt.getStart(sf),
      end: stmt.getEnd(),
      insertPos: target.body.getStart(sf) + 1,
      text: declText,
    });
  }
  return hoists;
}

function hasHumanLiteral(node, sf) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && looksHuman(n.text)) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

// Returns the source with every safe module-scope const moved into its
// component. Deterministic — extract and apply both run it, so both see the
// exact same text and the offsets line up.
function hoistModuleConsts(source, filePath) {
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const hoists = collectHoists(sf, source);
  if (hoists.length === 0) return source;

  const edits = [];
  for (const h of hoists) {
    if (h.insertPos <= h.end) continue; // component declared before the const
    edits.push({ pos: h.insertPos, insert: `\n  ${h.text}\n` });
    let end = h.end;
    while (end < source.length && (source[end] === '\n' || source[end] === '\r')) end += 1;
    edits.push({ pos: h.start, end, insert: '' });
  }
  edits.sort((a, b) => b.pos - a.pos);
  let out = source;
  for (const e of edits) out = out.slice(0, e.pos) + e.insert + out.slice(e.end ?? e.pos);
  return out;
}

// ── template / ternary expansion ────────────────────────────────────
// Flattens an expression into full-sentence variants. Every inner string
// ternary doubles the variant count; other expressions become {pN} params.

const isStringish = (n) =>
  ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n);

function combine(a, b) {
  if (a.length * b.length > MAX_VARIANTS) return null;
  const out = [];
  for (const x of a) {
    for (const y of b) {
      out.push({
        text: x.text + y.text,
        params: [...x.params, ...y.params],
        choices: [...x.choices, ...y.choices],
      });
    }
  }
  return out;
}

function flatten(node, sf) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [{ text: node.text, params: [], choices: [] }];
  }
  if (ts.isParenthesizedExpression(node)) return flatten(node.expression, sf);
  if (ts.isTemplateExpression(node)) {
    let parts = [{ text: node.head.text, params: [], choices: [] }];
    for (const span of node.templateSpans) {
      const inner = flatten(span.expression, sf);
      if (!inner) return null;
      parts = combine(parts, inner);
      if (!parts) return null;
      parts = combine(parts, [{ text: span.literal.text, params: [], choices: [] }]);
      if (!parts) return null;
    }
    return parts;
  }
  if (ts.isConditionalExpression(node) && isStringish(node.whenTrue) && isStringish(node.whenFalse)) {
    const cond = { src: node.condition.getText(sf), id: node.getStart(sf) };
    const t = flatten(node.whenTrue, sf);
    const f = flatten(node.whenFalse, sf);
    if (!t || !f) return null;
    const out = [
      ...t.map((v) => ({ ...v, choices: [...v.choices, { ...cond, branch: true }] })),
      ...f.map((v) => ({ ...v, choices: [...v.choices, { ...cond, branch: false }] })),
    ];
    return out.length > MAX_VARIANTS ? null : out;
  }
  return [{ text: PARAM, params: [node.getText(sf)], choices: [] }];
}

// Variant text with PARAM sentinels → '{p0} … {p1}'.
function numberParams(text) {
  let i = 0;
  return text.replace(new RegExp(PARAM, 'g'), () => `{p${i++}}`);
}

// Builds the replacement: a single tt() call, or a conditional tree over the
// expanded ternaries.
function renderVariants(variants, keyOf) {
  // A branch without letters ('' from `cond ? \`Fertig: ${d}\` : ''`) is not a
  // text. Routing it through tt() would put an empty string into the
  // translation batch, and _llm_translate rejects the WHOLE batch when one
  // item comes back empty — live-seen: one '' cost 40 texts their translation.
  const literalOf = (v) => {
    if (v.params.length === 0) return JSON.stringify(v.text);
    let i = 0;
    const body = v.text
      .replace(/[\\`$]/g, '\\$&')
      .replace(new RegExp(PARAM, 'g'), () => '${' + v.params[i++] + '}');
    return '`' + body + '`';
  };
  const call = (v) => {
    if (!v.human) return literalOf(v);
    const key = keyOf(v.numbered);
    if (v.params.length === 0) return `tt('${key}')`;
    const args = v.params.map((p, i) => `p${i}: ${p}`).join(', ');
    return `tt('${key}', { ${args} })`;
  };
  const same = variants.every(
    (v) => v.numbered === variants[0].numbered && v.params.join(' ') === variants[0].params.join(' '),
  );
  if (variants.length === 1 || same) return call(variants[0]);

  const walk = (list, used) => {
    if (list.length === 1) return call(list[0]);
    const choice = list[0].choices.find(
      (c) => !used.has(c.id) && list.every((v) => v.choices.some((o) => o.id === c.id)),
    );
    // No condition separates these variants — rendering any one of them would
    // silently drop the others' text. Decline; the span becomes residue.
    if (!choice) return null;
    const branchOf = (v) => v.choices.find((o) => o.id === choice.id).branch;
    const t = list.filter(branchOf);
    const f = list.filter((v) => !branchOf(v));
    if (!t.length || !f.length) return null;
    const next = new Set(used).add(choice.id);
    const a = walk(t, next), b = walk(f, next);
    return a === null || b === null ? null : `${choice.src} ? ${a} : ${b}`;
  };
  const tree = walk(variants, new Set());
  return tree === null ? null : `(${tree})`;
}

// ── existing makeT table ────────────────────────────────────────────

function findTable(sf) {
  let table = null;
  const visit = (n) => {
    if (
      !table && ts.isCallExpression(n) && ts.isIdentifier(n.expression) &&
      n.expression.text === 'makeT' && n.arguments.length &&
      ts.isObjectLiteralExpression(n.arguments[0])
    ) {
      const rows = {};
      for (const p of n.arguments[0].properties) {
        if (!ts.isPropertyAssignment(p) || !ts.isObjectLiteralExpression(p.initializer)) continue;
        const lang = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : null;
        if (!lang) continue;
        const entries = new Map();
        const keys = new Set();
        for (const q of p.initializer.properties) {
          if (!ts.isPropertyAssignment(q)) continue;
          const k = ts.isIdentifier(q.name) || ts.isStringLiteral(q.name) ? q.name.text : null;
          if (!k) continue;
          keys.add(k);
          if (ts.isStringLiteral(q.initializer) || ts.isNoSubstitutionTemplateLiteral(q.initializer)) {
            entries.set(q.initializer.text, k);
          }
        }
        const props = p.initializer.properties;
        const last = props[props.length - 1];
        let insertPos = p.initializer.getStart(sf) + 1;
        let indent = '    ';
        let needsComma = false;
        if (last) {
          const lineStart = sf.text.lastIndexOf('\n', last.getStart(sf)) + 1;
          indent = sf.text.slice(lineStart, last.getStart(sf));
          if (!/^\s*$/.test(indent)) indent = '    ';
          insertPos = last.getEnd();
          if (sf.text[insertPos] === ',') insertPos += 1;
          else needsComma = true;
        }
        rows[lang] = { insertPos, indent, needsComma, keys, entries };
      }
      table = { rows, start: n.getStart(sf), end: n.getEnd() };
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return table;
}

// ── scan ────────────────────────────────────────────────────────────

function scan(filePath, sourceOverride) {
  const raw = sourceOverride ?? readFileSync(filePath, 'utf8');
  const isIntents = isIntentsFile(filePath);
  const source = isIntents ? raw : hoistModuleConsts(raw, filePath);
  const sf = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const table = isIntents ? null : findTable(sf);
  const spans = [];
  const residues = [];
  let moduleScope = 0;

  const lineNo = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const inTable = (pos) => table && pos >= table.start && pos < table.end;

  const pushResidue = (kind, start, end, text) => {
    // A makeT-table entry is never a residue — it IS the i18n solution.
    // record() always had this guard; the residue paths did not, so every
    // multi-word table value whose key is not in PROPS was reported as a
    // 'prop' residue. Harmless noise until the promotion pass met a file
    // that ALREADY had a table: every table value trivially maps to its own
    // key, so promotion rewrote the values into tt('…') calls INSIDE the
    // initializer — TS7022/TS2448, two fresh-build heals in a row (first
    // combination of promotion + pre-existing table; every live update
    // before it had created the table itself).
    if (inTable(start)) return;
    if (lineOf(source, start).includes('i18n-exempt')) return;
    if (residues.some((r) => start >= r.start && start < r.end)) return;
    residues.push({
      kind, start, end, line: lineNo(start),
      text: text.replace(/\s+/g, ' ').trim().slice(0, 100),
      // The verbatim line so a fixer can Edit without reading the file first.
      src: lineOf(source, start).trim().slice(0, 200),
    });
  };

  // Simple span: one text, one replacement shape.
  const record = (kind, start, end, text, node, wrap) => {
    if (!HAS_LETTER.test(text)) return false;
    if (inTable(start)) return false;
    if (lineOf(source, start).includes('i18n-exempt')) return false;
    if (!enclosingFunction(node)) {
      moduleScope += 1;
      pushResidue('module-scope', start, end, text);
      return false;
    }
    spans.push({ start, end, kind, texts: [text], render: (keyOf) => wrap(keyOf(text)) });
    return true;
  };

  // Expanded span: template literal or string ternary.
  const recordInterp = (node) => {
    const start = node.getStart(sf);
    const end = node.getEnd();
    if (inTable(start)) return false;
    if (lineOf(source, start).includes('i18n-exempt')) return false;
    if (inClassNameContext(node, sf)) return false;

    const variants = flatten(node, sf);
    if (!variants) {
      pushResidue('too-branchy', start, end, node.getText(sf));
      return false;
    }
    for (const v of variants) {
      v.numbered = numberParams(v.text);
      v.human = looksHuman(v.numbered.replace(/\{p\d+\}/g, ' '));
    }
    if (!variants.some((v) => v.human)) return false;
    if (!enclosingFunction(node)) {
      moduleScope += 1;
      pushResidue('module-scope', start, end, node.getText(sf));
      return false;
    }
    // A param may still hide a German literal (it is copied verbatim).
    for (const p of variants[0].params) {
      const m = p.match(/'([^']{4,})'|"([^"]{4,})"/);
      if (m && looksHuman(m[1] ?? m[2])) pushResidue('in-param', start, end, m[1] ?? m[2]);
    }
    spans.push({
      start, end, kind: 'interp',
      texts: [...new Set(variants.filter((v) => v.human).map((v) => v.numbered))],
      render: (keyOf) => renderVariants(variants, keyOf),
    });
    return true;
  };

  const visit = (node) => {
    if (isIntents) {
      // Registry data: only legacy plain-string labels; multilingual objects
      // and everything else stay untouched. `description` gets the same
      // treatment — it is typed `string | {de,en}` for exactly this reason, and
      // leaving it out made every update detour through the fixer, which
      // rediscovered from scratch that the field is not rendered and decided
      // differently each time.
      if (
        ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) &&
        (node.name.text === 'label' || node.name.text === 'description') &&
        ts.isStringLiteral(node.initializer) &&
        HAS_LETTER.test(node.initializer.text) &&
        !lineOf(source, node.initializer.getStart(sf)).includes('i18n-exempt')
      ) {
        const init = node.initializer;
        spans.push({
          start: init.getStart(sf), end: init.getEnd(), kind: 'intentlabel',
          texts: [init.text], render: null, text: init.text,
        });
      }
      ts.forEachChild(node, visit);
      return;
    }

    if (ts.isJsxText(node)) {
      const raw2 = node.getText(sf);
      // JSX collapses newline+indent runs when it renders, so a wrapped line
      // is ONE text. Keeping the raw newline wrote it verbatim into the makeT
      // table and produced an unterminated string literal (live-seen).
      const trimmed = raw2.replace(/\s+/g, ' ').trim();
      if (trimmed) {
        const lead = raw2.match(/^\s*/)[0];
        const trail = raw2.match(/\s*$/)[0];
        record('jsxtext', node.getStart(sf), node.getEnd(), trimmed, node,
          (k) => `${lead}{tt('${k}')}${trail}`);
      }
    } else if (
      ts.isJsxAttribute(node) && node.initializer && ATTRS.has(node.name.getText(sf))
    ) {
      const init = node.initializer;
      if (ts.isStringLiteral(init)) {
        record('attr', init.getStart(sf), init.getEnd(), init.text, node, (k) => `{tt('${k}')}`);
      } else if (ts.isJsxExpression(init) && init.expression && ts.isStringLiteral(init.expression)) {
        record('attrexpr', init.expression.getStart(sf), init.expression.getEnd(),
          init.expression.text, node, (k) => `tt('${k}')`);
      }
    } else if (
      ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) &&
      PROPS.has(node.name.text) &&
      (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      record('prop', node.initializer.getStart(sf), node.initializer.getEnd(),
        node.initializer.text, node, (k) => `tt('${k}')`);
    } else if (
      // Same shape, name not on the list: report instead of dropping it.
      ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) &&
      ts.isStringLiteral(node.initializer) && /\s/.test(node.initializer.text.trim()) &&
      looksHuman(node.initializer.text) && !DATE_PATTERN.test(node.initializer.text) &&
      !inClassNameContext(node, sf)
    ) {
      pushResidue('prop', node.initializer.getStart(sf), node.initializer.getEnd(),
        node.initializer.text);
    } else if (ts.isTemplateExpression(node)) {
      if (recordInterp(node)) return;   // subtree consumed
    } else if (
      ts.isConditionalExpression(node) && isStringish(node.whenTrue) && isStringish(node.whenFalse)
    ) {
      if (recordInterp(node)) return;   // subtree consumed
    } else if (
      // Only ONE branch is copy — the other is an error message, a JSX element,
      // a variable. Convert that branch alone and leave the ternary standing;
      // eight of these cost a fixer run its whole 213 seconds.
      ts.isConditionalExpression(node) &&
      (ts.isStringLiteral(node.whenTrue) !== ts.isStringLiteral(node.whenFalse)) &&
      !inClassNameContext(node, sf)
    ) {
      const side = ts.isStringLiteral(node.whenTrue) ? node.whenTrue : node.whenFalse;
      if (ts.isStringLiteral(side) && looksHuman(side.text) && !DATE_PATTERN.test(side.text)) {
        // Same rule as a call argument: one word may be a status value the API
        // reads back (`ok ? 'Aktiv' : null`), a phrase is copy.
        if (!/\s/.test(side.text.trim())) {
          pushResidue('branch', side.getStart(sf), side.getEnd(), side.text);
        } else {
          record('branch', side.getStart(sf), side.getEnd(), side.text, node, (k) => `tt('${k}')`);
        }
      }
    } else if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        // `contextLine += 'Willkommen …'` builds a sentence piece by piece and
        // was in no covered position at all (live-seen, BeteiligungsManager).
        node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) &&
      ts.isStringLiteral(node.right) && looksHuman(node.right.text) &&
      !inClassNameContext(node, sf)
    ) {
      record('fallback', node.right.getStart(sf), node.right.getEnd(), node.right.text, node,
        (k) => `tt('${k}')`);
    } else if (
      ts.isReturnStatement(node) && node.expression &&
      ts.isStringLiteral(node.expression) && looksHuman(node.expression.text) &&
      !inClassNameContext(node.expression, sf)
    ) {
      // A sentence computed in a helper and rendered as {subtitle} sits in no
      // JSX text, no attribute and no allowlisted prop — it was invisible to
      // this scan AND to gate 21, so it stayed German while the page around
      // it turned English (live-seen: the hero line of a BeteiligungsManager).
      // Same rule as a call argument: one word may be a status key the API
      // reads back ('Aktiv'), a phrase is copy.
      const text = node.expression.text;
      if (DATE_PATTERN.test(text) || !/\s/.test(text.trim())) {
        pushResidue('return', node.expression.getStart(sf), node.expression.getEnd(), text);
      } else {
        record('return', node.expression.getStart(sf), node.expression.getEnd(), text, node,
          (k) => `tt('${k}')`);
      }
    } else if (
      // `let msg = 'Die Anmeldung konnte nicht …'` and the `msg = '…'` that
      // follows it: a sentence assigned to a variable was in no position at
      // all. The phrase rule keeps `const status = 'Aktiv'` out of it.
      ((ts.isVariableDeclaration(node) && node.initializer &&
        ts.isStringLiteral(node.initializer)) ||
       (ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isStringLiteral(node.right))) &&
      !inClassNameContext(node, sf)
    ) {
      const lit = ts.isVariableDeclaration(node) ? node.initializer : node.right;
      if (ts.isStringLiteral(lit) && looksHuman(lit.text) && !DATE_PATTERN.test(lit.text)) {
        if (!/\s/.test(lit.text.trim())) {
          pushResidue('assign', lit.getStart(sf), lit.getEnd(), lit.text);
        } else {
          record('assign', lit.getStart(sf), lit.getEnd(), lit.text, node, (k) => `tt('${k}')`);
        }
      }
    } else if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      // `new Error('Kein Datensatz zurückgegeben')` is a call argument in every
      // way that matters here — TypeScript just gives it its own node kind.
      const callee = node.expression.getText(sf);
      if (!SKIP_CALLEE.test(callee) && !CN_CALLEES.has(callee)) {
        const isCopy = COPY_CALLEE.test(callee);
        for (const arg of node.arguments ?? []) {
          if (!ts.isStringLiteral(arg) || !looksHuman(arg.text)) continue;
          if (inClassNameContext(arg, sf) || DATE_PATTERN.test(arg.text)) continue;
          // For an unknown callee a single word may well be a key or a filter
          // value (matches('Impfung')) — only whole phrases are safely copy.
          if (!isCopy && !/\s/.test(arg.text.trim())) {
            pushResidue('callarg', arg.getStart(sf), arg.getEnd(), arg.text);
            continue;
          }
          record('callarg', arg.getStart(sf), arg.getEnd(), arg.text, node, (k) => `tt('${k}')`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  // Overlapping spans would corrupt the file — keep the outermost.
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  for (const s of spans) {
    if (kept.length && s.start < kept[kept.length - 1].end) continue;
    kept.push(s);
  }
  residues.sort((a, b) => a.start - b.start);

  let importEnd = 0;
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt)) importEnd = stmt.getEnd();
  }
  return { source, spans: kept, residues, moduleScope, importEnd, table, isIntents };
}

function slugify(text, used) {
  let slug = text.toLowerCase()
    .replace(/\{p\d+\}/g, ' ')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 32).replace(/_+$/g, '') || 'text';
  if (/^[0-9]/.test(slug)) slug = 'n' + slug;
  if (RESERVED.has(slug)) slug += '_txt';
  let key = slug;
  for (let i = 2; used.has(key); i++) key = `${slug}_${i}`;
  used.add(key);
  return key;
}

// The rewrite is only allowed out if it still parses. Without this a bug in
// this script ships a broken file that only `npm run build` finds — minutes
// later, inside the fixer agent (live-seen: an unterminated string literal).
function verify(src, filePath) {
  const sf = ts.createSourceFile(
    filePath, src, ts.ScriptTarget.Latest, true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const diags = sf.parseDiagnostics ?? [];
  if (!diags.length) return;
  const d = diags[0];
  const { line } = sf.getLineAndCharacterOfPosition(d.start ?? 0);
  throw new Error(
    `rewrite would not parse (line ${line + 1}: ` +
    `${ts.flattenDiagnosticMessageText(d.messageText, ' ')}) — file left unchanged`,
  );
}

function apply(filePath, translations, source) {
  const result = scan(filePath);
  const { spans, table, importEnd, moduleScope } = result;
  let out = result.source;
  if (spans.length === 0) {
    if (out !== readFileSync(filePath, 'utf8')) { verify(out, filePath); writeFileSync(filePath, out); }
    return { file: filePath, replaced: 0, moduleScope };
  }

  const other = source === 'en' ? 'de' : 'en';

  if (result.isIntents) {
    for (const s of [...spans].sort((a, b) => b.start - a.start)) {
      const tr = translations[s.text] ?? s.text;
      out = out.slice(0, s.start) +
        `{ ${source}: '${esc(s.text)}', ${other}: '${esc(tr)}' }` +
        out.slice(s.end);
    }
    verify(out, filePath);
  writeFileSync(filePath, out);
    return { file: filePath, replaced: spans.length, moduleScope: 0 };
  }

  // Key assignment: reuse what the table already has, invent the rest.
  const existing = table?.rows[source]?.entries ?? new Map();
  const used = new Set([
    ...(table?.rows[source]?.keys ?? []),
    ...(table?.rows[other]?.keys ?? []),
  ]);
  const keyByText = new Map();
  const fresh = [];
  for (const s of spans) {
    for (const text of s.texts) {
      if (keyByText.has(text)) continue;
      const known = existing.get(text);
      if (known) { keyByText.set(text, known); continue; }
      const key = slugify(text, used);
      keyByText.set(text, key);
      fresh.push([text, key]);
    }
  }
  const keyOf = (text) => keyByText.get(text) ?? 'text';

  // A residue whose exact text already earned a key IN THIS FILE needs no
  // judgement — the same words were ruled copy a few lines up. Live Yogastudio
  // run: `: 'Kurs'` twice, while `kurs: 'Kurs'` sat in the table the pass had
  // just written; the fixer spent minutes re-deriving `tt('kurs')`.
  // Only kinds whose span wraps the literal EXACTLY may be promoted: an
  // in-param span covers the whole interpolation (replacing it would delete the
  // call), and module-scope/too-branchy carry whole-node source as their text.
  const PROMOTABLE = new Set(['return', 'callarg', 'branch', 'assign', 'prop']);
  const promoted = [];
  for (const r of result.residues) {
    if (!PROMOTABLE.has(r.kind)) continue;
    // Second line of defence for the table interior (scan already filters
    // these): a promotion inside the initializer is a guaranteed TS2448.
    if (table && r.start >= table.start && r.start < table.end) continue;
    const key = keyByText.get(r.text) ?? existing.get(r.text);
    if (!key) continue;
    if (spans.some((sp) => r.start < sp.end && sp.start < r.end)) continue;
    promoted.push({ start: r.start, end: r.end, text: `tt('${key}')` });
  }

  // Every edit in one descending pass so the offsets stay valid.
  const edits = spans
    .map((s) => ({ start: s.start, end: s.end, text: s.render(keyOf) }))
    .filter((e) => e.text !== null)
    .concat(promoted);

  if (fresh.length) {
    if (table) {
      for (const [lang, row] of Object.entries(table.rows)) {
        const pick = lang === source ? (t) => t : (t) => translations[t] ?? t;
        const body = fresh
          .map(([text, key]) => `\n${row.indent}${key}: '${esc(pick(text))}',`).join('');
        edits.push({
          start: row.insertPos, end: row.insertPos,
          text: (row.needsComma ? ',' : '') + body,
        });
      }
    } else {
      const row = (pick) => fresh
        .map(([text, key]) => `    ${key}: '${esc(pick(text))}',`).join('\n');
      const tableSrc = `\n\nimport { makeT } from '@/i18n';\n\nconst tt = makeT({\n` +
        `  ${source}: {\n${row((t) => t)}\n  },\n` +
        `  ${other}: {\n${row((t) => translations[t] ?? t)}\n  },\n});`;
      edits.push({ start: importEnd, end: importEnd, text: tableSrc });
    }
  }

  edits.sort((a, b) => b.start - a.start);
  for (const e of edits) out = out.slice(0, e.start) + e.text + out.slice(e.end);

  verify(out, filePath);
  writeFileSync(filePath, out);
  return {
    file: filePath, replaced: spans.length + promoted.length, moduleScope,
    reused: promoted.length,
  };
}

// ── verify: an independent net under the extraction ──────────────────
//
// The scan can only convert what its position rules and looksHuman() accept,
// and gate 21 cannot see template literals at all. Twice that combination
// shipped a German sentence on an English page while the run reported
// "0 residues, gates green" — the user's eyes were the only detector. This
// pass asks a DIFFERENT question with a DIFFERENT detector: is there German
// prose anywhere outside the makeT table, and does any en value still equal
// its de value? It therefore also covers files the migration never scans.
const GERMAN_WORD = /(^|[^A-Za-zÀ-ž])(?:der|das|den|dem|des|eine|einen|einem|einer|kein|keine|keinen|nicht|noch|und|oder|für|mit|von|vom|zum|zur|aus|bei|ist|sind|wird|werden|wurde|wurden|sofort|jetzt|bitte|alle|alles|ohne|sich|dein|deine|deinen|nächste|nächsten|offene|offenen|neue|neuer|neues)(?![A-Za-zÀ-ž])/i;

function looksGerman(text) {
  const t = text.replace(/\s+/g, ' ').trim();
  const words = t.split(' ').filter((w) => /[A-Za-zÀ-ž]{2,}/.test(w));
  if (words.length < 2) return false;          // a lone token is a value, not prose
  if (GERMAN_WORD.test(t)) return true;
  return /[äöüßÄÖÜ]/.test(t);
}

function verifyFile(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const sf = ts.createSourceFile(
    filePath, source, ts.ScriptTarget.Latest, true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lineNo = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const squash = (t) => t.replace(/\s+/g, ' ').trim().slice(0, 90);

  // makeT tables: their de row is SUPPOSED to be German — read the rows and
  // exclude their range from the prose hunt.
  const ranges = [];
  const rows = {};
  const collect = (n) => {
    const isLocaleTable =
      ts.isObjectLiteralExpression(n) &&
      ['de', 'en'].every((l) => n.properties.some(
        (pr) => ts.isPropertyAssignment(pr) &&
          pr.name.getText(sf).replace(/['"]/g, '') === l &&
          ts.isObjectLiteralExpression(pr.initializer),
      ));
    // A per-entry pair — `label: { de: '…', en: '…' }` in the intent registry,
    // and `description` since it took the same shape. Values are STRINGS here,
    // not nested rows, so isLocaleTable walks past it and the de side gets
    // reported as a leftover: the checker calling correct code broken.
    // Both languages must be present; a de-only object really is a gap.
    const localeKey = (pr) => pr.name.getText(sf).replace(/['"]/g, '');
    const isLocalePair =
      ts.isObjectLiteralExpression(n) && n.properties.length > 0 &&
      n.properties.every((pr) =>
        ts.isPropertyAssignment(pr) && /^(de|en|cs)$/.test(localeKey(pr)) &&
        (ts.isStringLiteral(pr.initializer) ||
          ts.isNoSubstitutionTemplateLiteral(pr.initializer))) &&
      ['de', 'en'].every((l) => n.properties.some((pr) => localeKey(pr) === l));
    if (isLocalePair) ranges.push([n.getStart(sf), n.getEnd()]);
    if (isLocaleTable) {
      ranges.push([n.getStart(sf), n.getEnd()]);
      for (const langProp of n.properties) {
        if (!ts.isPropertyAssignment(langProp) || !ts.isObjectLiteralExpression(langProp.initializer)) continue;
        const lang = langProp.name.getText(sf).replace(/['"]/g, '');
        const row = rows[lang] ?? (rows[lang] = new Map());
        for (const e of langProp.initializer.properties) {
          if (
            ts.isPropertyAssignment(e) &&
            (ts.isStringLiteral(e.initializer) || ts.isNoSubstitutionTemplateLiteral(e.initializer))
          ) row.set(e.name.getText(sf).replace(/['"]/g, ''), e.initializer.text);
        }
      }
    }
    ts.forEachChild(n, collect);
  };
  collect(sf);
  const inAnyTable = (pos) => ranges.some(([a, b]) => pos >= a && pos < b);

  const leftover = [];
  const visit = (n) => {
    let text = null;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text;
    else if (ts.isTemplateExpression(n)) {
      text = [n.head.text, ...n.templateSpans.map((sp) => sp.literal.text)].join(' ');
    } else if (ts.isJsxText(n)) text = n.text;
    if (
      text != null && looksGerman(text) && !inAnyTable(n.getStart(sf)) &&
      !inClassNameContext(n, sf) && !lineOf(source, n.getStart(sf)).includes('i18n-exempt')
    ) {
      leftover.push({
        line: lineNo(n.getStart(sf)), text: squash(text),
        src: lineOf(source, n.getStart(sf)).trim().slice(0, 200),
      });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  // A row that merely copies the source language is a failed translation, and
  // no gate can see it: the table is structurally complete.
  const untranslated = [];
  const langs = Object.keys(rows);
  if (langs.length >= 2) {
    const [first, ...rest] = langs;
    for (const [key, val] of rows[first]) {
      for (const other of rest) {
        if (rows[other].get(key) === val && looksGerman(val)) {
          untranslated.push({ key, text: squash(val), langs: `${first}=${other}` });
        }
      }
    }
  }
  return { leftover, untranslated };
}

const [mode, ...files] = process.argv.slice(2);
if (!mode || files.length === 0) {
  console.error('usage: i18n-migrate.mjs extract|apply|verify <files...>');
  process.exit(1);
}

if (mode === 'verify') {
  const out = {};
  for (const f of files) {
    try {
      const r = verifyFile(f);
      if (r.leftover.length || r.untranslated.length) out[f] = r;
    } catch (e) {
      out[f] = { error: String(e && e.message ? e.message : e) };
    }
  }
  console.log(JSON.stringify(out));
} else if (mode === 'extract') {
  const perFile = {};
  const texts = new Set();
  const residues = {};
  for (const f of files) {
    let r;
    try {
      r = scan(f);
    } catch (e) {
      perFile[f] = { error: String(e.message ?? e).slice(0, 160) };
      continue;
    }
    const known = r.table?.rows ?? {};
    let pending = 0;
    for (const s of r.spans) {
      for (const text of s.texts) {
        // Already in the table (same file, earlier run) → no translation needed.
        const seen = Object.values(known).some((row) => row.entries.has(text));
        if (!seen) { texts.add(text); pending += 1; }
      }
    }
    perFile[f] = { count: r.spans.length, texts: pending, moduleScope: r.moduleScope, residue: r.residues.length };
    if (r.residues.length) {
      residues[f] = r.residues.map(({ kind, line, text, src }) => ({ kind, line, text, src }));
    }
  }
  writeFileSync(TEXTS_FILE, JSON.stringify({ files: perFile, texts: [...texts], residues }, null, 2));
  const residueCount = Object.values(residues).reduce((a, b) => a + b.length, 0);
  console.log(JSON.stringify({ files: perFile, uniqueTexts: texts.size, residue: residueCount }));
} else if (mode === 'apply') {
  const { source, map } = JSON.parse(readFileSync(TRANSLATIONS_FILE, 'utf8'));
  const results = files.map((f) => {
    try {
      return apply(f, map, source);
    } catch (e) {
      return { file: f, error: String(e.message ?? e).slice(0, 160) };
    }
  });
  console.log(JSON.stringify(results));
} else {
  console.error(`unknown mode '${mode}'`);
  process.exit(1);
}
