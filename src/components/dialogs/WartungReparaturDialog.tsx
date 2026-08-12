/**
 * WartungReparaturDialog — pre-generated create/edit dialog for WartungReparatur.
 *
 * Props: open, onClose, onSubmit(fields) => Promise<void>, defaultValues?,
 * recordId? (pass when EDITING — enables the attachments section),
 * werkzeugeList (full hook array — resolves the Werkzeuge applookup),
 * handwerkerList (full hook array — resolves the Handwerker applookup),
 * enablePhotoScan?, enablePhotoLocation?.
 *
 * defaultValues is SHAPE-TOLERANT and its prop type is the EXPORTED
 * WartungReparaturDialogDefaults — NOT the entity field type: lookup fields accept
 * the bare KEY string (or LookupValue), applookup fields the bare record id
 * (or record URL); the dialog normalizes. Type prefill STATE with the export:
 *  ❌ useState<Partial<WartungReparatur['fields']>>({ … })   // LookupValue fields reject string prefills (TS2322)
 *  ✓ useState<WartungReparaturDialogDefaults | undefined>(undefined)
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { WartungReparatur, Werkzeuge, Handwerker, LookupValue } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { extractRecordId, createRecordUrl, cleanFieldsForApi, uploadFile, getUserProfile, LivingAppsService } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ComputedContext } from '@/config/form-enhancements/types';
import { applyFieldOrder, flattenFieldOrder, applyDefaults, evalComputed, numberInputProps, clampNumberValue, classifyComputed, extractApplookupRefs, mergeApplookupRefs, resolveApplookupRef } from '@/config/form-enhancements/types';
import { formEnhancements, computedDeps, computedApplookupRefs } from '@/config/form-enhancements/WartungReparatur';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { t, appLabel, fieldLabel, lookupLabel, localeTag, CURRENCY } from '@/i18n';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/Combobox';
import { WerkzeugeDialog } from '@/components/dialogs/WerkzeugeDialog';
import { HandwerkerDialog } from '@/components/dialogs/HandwerkerDialog';
import { DatePicker } from '@/components/DatePicker';
import { Checkbox } from '@/components/ui/checkbox';
import { IconAlertCircle, IconCamera, IconChevronDown, IconCircleCheck, IconClipboard, IconFileText, IconLoader2, IconPhotoPlus, IconSparkles, IconUpload, IconX } from '@tabler/icons-react';
import { fileToDataUri, extractFromInput, extractPhotoMeta, reverseGeocode, dataUriToBlob } from '@/lib/ai';
import { lookupKey } from '@/lib/formatters';

/** Widened prefill type for WartungReparaturDialog.defaultValues — see file header. */
export type WartungReparaturDialogDefaults = Omit<WartungReparatur['fields'], 'vorgangsart' | 'status_wartung'> & {
    vorgangsart?: LookupValue | string;
    status_wartung?: LookupValue | string;
  };

interface WartungReparaturDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (fields: WartungReparatur['fields']) => Promise<void>;
  /** SHAPE-TOLERANT: lookup fields accept the bare key (string) or the
   *  LookupValue object; applookup fields the bare record id or the full
   *  record URL — the dialog normalizes both. */
  defaultValues?: WartungReparaturDialogDefaults;
  /** Record id when editing — enables the attachments section. Omit on create. */
  recordId?: string;
  werkzeugeList: Werkzeuge[];
  handwerkerList: Handwerker[];
  enablePhotoScan?: boolean;
  enablePhotoLocation?: boolean;
}

// defaultValues are SHAPE-TOLERANT: the dialog resolves bare lookup keys via
// its own options and bare record ids via the field's target app — consumers
// never carry the LookupValue/record-URL shape in their head.
const NORMALIZE_LOOKUPS: Record<string, readonly { key: string; label: string }[]> = {
  vorgangsart: LOOKUP_OPTIONS['wartung_reparatur']?.['vorgangsart'] ?? [],
  status_wartung: LOOKUP_OPTIONS['wartung_reparatur']?.['status_wartung'] ?? [],
};
const NORMALIZE_APPLOOKUPS: Record<string, string> = {
  werkzeug_wartung: APP_IDS.WERKZEUGE,
  verantwortlicher: APP_IDS.HANDWERKER,
};
function normalizeDefaults(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  for (const [k, opts] of Object.entries(NORMALIZE_LOOKUPS)) {
    const v = out[k];
    if (typeof v === 'string') out[k] = opts.find(o => o.key === v) ?? { key: v, label: v };
    else if (Array.isArray(v)) out[k] = v.map(x => (typeof x === 'string' ? opts.find(o => o.key === x) ?? { key: x, label: x } : x));
  }
  for (const [k, appId] of Object.entries(NORMALIZE_APPLOOKUPS)) {
    const v = out[k];
    if (typeof v === 'string' && v !== '' && !v.startsWith('http')) out[k] = createRecordUrl(appId, v);
    else if (Array.isArray(v)) out[k] = v.map(x => (typeof x === 'string' && x !== '' && !x.startsWith('http') ? createRecordUrl(appId, x) : x));
  }
  return out;
}

export function WartungReparaturDialog({ open, onClose, onSubmit, defaultValues, recordId, werkzeugeList, handwerkerList, enablePhotoScan = true, enablePhotoLocation = true }: WartungReparaturDialogProps) {
  const [fields, setFields] = useState<Partial<WartungReparatur['fields']>>({});
  const [saving, setSaving] = useState(false);
  const normalizedDefaults = useMemo<Record<string, unknown> | undefined>(
    () => (defaultValues ? normalizeDefaults(defaultValues as Record<string, unknown>) : undefined),
    [defaultValues],
  );
  // Dirty-tracking: in edit-mode the Speichern button is disabled until the
  // user actually changes something. JSON.stringify is good enough for our
  // fields (plain values + LookupValue objects + string arrays).
  const isDirty = useMemo(() => {
    if (!normalizedDefaults) return true;  // create-mode: always allow submit
    try {
      return JSON.stringify(fields) !== JSON.stringify(normalizedDefaults);
    } catch {
      return true;
    }
  }, [fields, normalizedDefaults]);
  // Inline-Create state for "Werkzeuge" target. The dropdown's
  // "+ Neuer …" option opens a sub-dialog; on submit we POST, add the new
  // record to the local `extraWerkzeuge` list, and select it in
  // the originating Combobox via the captured `createWerkzeugeField`.
  const [createWerkzeugeOpen, setCreateWerkzeugeOpen] = useState(false);
  const [createWerkzeugeInitial, setCreateWerkzeugeInitial] = useState('');
  const [createWerkzeugeField, setCreateWerkzeugeField] = useState<string>('');
  const [extraWerkzeuge, setExtraWerkzeuge] = useState< Werkzeuge[]>([]);
  const werkzeugeListAll = useMemo(
    () => [...werkzeugeList, ...extraWerkzeuge],
    [werkzeugeList, extraWerkzeuge],
  );
  function openCreateWerkzeuge(fieldKey: string, q: string) {
    setCreateWerkzeugeField(fieldKey);
    setCreateWerkzeugeInitial(q);
    setCreateWerkzeugeOpen(true);
  }
  // Inline-Create state for "Handwerker" target. The dropdown's
  // "+ Neuer …" option opens a sub-dialog; on submit we POST, add the new
  // record to the local `extraHandwerker` list, and select it in
  // the originating Combobox via the captured `createHandwerkerField`.
  const [createHandwerkerOpen, setCreateHandwerkerOpen] = useState(false);
  const [createHandwerkerInitial, setCreateHandwerkerInitial] = useState('');
  const [createHandwerkerField, setCreateHandwerkerField] = useState<string>('');
  const [extraHandwerker, setExtraHandwerker] = useState< Handwerker[]>([]);
  const handwerkerListAll = useMemo(
    () => [...handwerkerList, ...extraHandwerker],
    [handwerkerList, extraHandwerker],
  );
  function openCreateHandwerker(fieldKey: string, q: string) {
    setCreateHandwerkerField(fieldKey);
    setCreateHandwerkerInitial(q);
    setCreateHandwerkerOpen(true);
  }
  const [showErrors, setShowErrors] = useState(false);
  const REQUIRED_FIELDS = ['werkzeug_wartung', 'vorgangsart', 'startdatum', 'status_wartung'] as const;
  const missingRequired = REQUIRED_FIELDS.filter(k => {
    const v = (fields as Record<string, unknown>)[k];
    return v == null || v === '' || (Array.isArray(v) && v.length === 0);
  });
  const [aiOpen, setAiOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanSuccess, setScanSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [usePersonalInfo, setUsePersonalInfo] = useState(() => {
    try { return localStorage.getItem('ai-use-personal-info') === 'true'; } catch { return false; }
  });
  const [showProfileInfo, setShowProfileInfo] = useState(false);
  const [profileData, setProfileData] = useState<Record<string, unknown> | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [aiText, setAiText] = useState('');

  // Computed-field plumbing. Pure no-op when formEnhancements.computed is {}.
  // The number renderer uses computedValues only as a fallback when the user
  // hasn't typed anything — clearing the input always restores the computation.
  // computedContext exposes applookup list props so { kind: 'applookup', ... }
  // operands can resolve to numeric fields on the target record.
  const computedContext = useMemo<ComputedContext>(() => ({
    lookupLists: {
      'werkzeug_wartung': werkzeugeList,
      'verantwortlicher': handwerkerList,
    },
  }), [werkzeugeList, handwerkerList, ]);
  const computedValues = useMemo<Record<string, number | null>>(() => {
    let out: Record<string, number | null> = {};
    const entries = Object.entries(formEnhancements.computed);
    for (let i = 0; i < 5; i++) {
      const merged: Record<string, unknown> = { ...(fields as Record<string, unknown>) };
      for (const [k, v] of Object.entries(out)) {
        if (v === null) continue;
        const cur = merged[k];
        if (cur === undefined || cur === null || cur === '') merged[k] = v;
      }
      const next: Record<string, number | null> = {};
      let changed = false;
      for (const [key, spec] of entries) {
        const v = evalComputed(spec, merged, computedContext);
        next[key] = v;
        if (v !== out[key]) changed = true;
      }
      out = next;
      if (!changed) break;
    }
    return out;
  }, [fields, computedContext]);

  useEffect(() => {
    if (open) {
      setFields(applyDefaults(normalizedDefaults ?? {}, formEnhancements.defaults) as Partial<WartungReparatur['fields']>);
      setPreview(null);
      setScanSuccess(false);
      setAiText('');
      setSubmitError(null);
    }
  }, [open, normalizedDefaults]);
  useEffect(() => {
    try { localStorage.setItem('ai-use-personal-info', String(usePersonalInfo)); } catch {}
  }, [usePersonalInfo]);
  async function handleShowProfileInfo() {
    if (showProfileInfo) { setShowProfileInfo(false); return; }
    setProfileLoading(true);
    try {
      const p = await getUserProfile();
      setProfileData(p);
    } catch {
      setProfileData(null);
    } finally {
      setProfileLoading(false);
      setShowProfileInfo(true);
    }
  }

  // Submit errors surface IN the dialog (it is modal — a banner in the page
  // body would be hidden behind it). A consumer onSubmit that THROWS (the
  // documented "throw to prevent closing" validation pattern) lands here:
  // the dialog stays open, nothing is saved, the message is visible.
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (missingRequired.length > 0) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setSubmitError(null);
    try {
      // Fill empty number slots from computed values; user-typed values always win.
      // CRITICAL: only backend-mapped keys may be backfilled. Virtual computeds
      // (sub-agent invents `_netto`, `_bestellung_gesamtbetrag` etc. for the
      // "Berechnungen" display) have no backend counterpart — writing them
      // triggers a 422 from the Living-Apps API ("field does not exist").
      const merged = { ...fields };
      for (const [key, val] of Object.entries(computedValues)) {
        if (val === null) continue;
        if (!backendFieldSet.has(key)) continue;
        const cur = (merged as Record<string, unknown>)[key];
        if (cur === undefined || cur === null || cur === '') {
          (merged as Record<string, unknown>)[key] = val;
        }
      }
      const clean = cleanFieldsForApi(merged, 'wartung_reparatur');
      await onSubmit(clean as WartungReparatur['fields']);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error && err.message ? err.message : t('submit_error'));
    } finally {
      setSaving(false);
    }
  }

  async function handleAiExtract(file?: File) {
    if (!file && !aiText.trim()) return;
    setScanning(true);
    setScanSuccess(false);
    try {
      let uri: string | undefined;
      let gps: { latitude: number; longitude: number } | null = null;
      let geoAddr = '';
      const parts: string[] = [];
      if (file) {
        const [dataUri, meta] = await Promise.all([fileToDataUri(file), extractPhotoMeta(file)]);
        uri = dataUri;
        if (file.type.startsWith('image/')) setPreview(uri);
        gps = enablePhotoLocation ? meta?.gps ?? null : null;
        if (gps) {
          geoAddr = await reverseGeocode(gps.latitude, gps.longitude);
          parts.push(`Location coordinates: ${gps.latitude}, ${gps.longitude}`);
          if (geoAddr) parts.push(`Reverse-geocoded address: ${geoAddr}`);
        }
        if (meta?.dateTime) {
          parts.push(`Date taken: ${meta.dateTime.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')}`);
        }
      }
      const contextParts: string[] = [];
      if (parts.length) {
        contextParts.push(`<photo-metadata>\nThe following metadata was extracted from the photo\'s EXIF data:\n${parts.join('\n')}\n</photo-metadata>`);
      }
      contextParts.push(`<available-records field="werkzeug_wartung" entity="Werkzeuge">\n${JSON.stringify(werkzeugeList.map(r => ({ record_id: r.record_id, ...r.fields })), null, 2)}\n</available-records>`);
      contextParts.push(`<available-records field="verantwortlicher" entity="Handwerker">\n${JSON.stringify(handwerkerList.map(r => ({ record_id: r.record_id, ...r.fields })), null, 2)}\n</available-records>`);
      if (usePersonalInfo) {
        try {
          const profile = await getUserProfile();
          contextParts.push(`<user-profile>\nThe following is the logged-in user\'s personal information. Use this to pre-fill relevant fields like name, email, address, company etc. when appropriate:\n${JSON.stringify(profile, null, 2)}\n</user-profile>`);
        } catch (err) {
          console.warn('Failed to fetch user profile:', err);
        }
      }
      const photoContext = contextParts.length ? contextParts.join('\n') : undefined;
      const schema = `{\n  "werkzeug_wartung": string | null, // Display name from Werkzeuge (see <available-records>)\n  "vorgangsart": LookupValue | null, // Vorgangsart (select one key: "wartung" | "reparatur") mapping: wartung=Wartung, reparatur=Reparatur\n  "verantwortlicher": string | null, // Display name from Handwerker (see <available-records>)\n  "startdatum": string | null, // YYYY-MM-DD\n  "geplantes_enddatum": string | null, // YYYY-MM-DD\n  "tatsaechliches_enddatum": string | null, // YYYY-MM-DD\n  "beschreibung": string | null, // Beschreibung des Problems / der Maßnahme\n  "status_wartung": LookupValue | null, // Status (select one key: "geplant" | "in_bearbeitung" | "abgeschlossen" | "abgebrochen") mapping: geplant=Geplant, in_bearbeitung=In Bearbeitung, abgeschlossen=Abgeschlossen, abgebrochen=Abgebrochen\n  "kosten": number | null, // Kosten (€)\n  "bemerkungen_wartung": string | null, // Bemerkungen\n}`;
      const raw = await extractFromInput<Record<string, unknown>>(schema, {
        dataUri: uri,
        userText: aiText.trim() || undefined,
        photoContext,
        intent: DIALOG_INTENT,
      });
      setFields(prev => {
        const merged = { ...prev } as Record<string, unknown>;
        function matchName(name: string, candidates: string[]): boolean {
          const n = name.toLowerCase().trim();
          return candidates.some(c => c.toLowerCase().includes(n) || n.includes(c.toLowerCase()));
        }
        const applookupKeys = new Set<string>(["werkzeug_wartung", "verantwortlicher"]);
        for (const [k, v] of Object.entries(raw)) {
          if (applookupKeys.has(k)) continue;
          if (v != null) merged[k] = v;
        }
        const werkzeug_wartungName = raw['werkzeug_wartung'] as string | null;
        if (werkzeug_wartungName) {
          const werkzeug_wartungMatch = werkzeugeList.find(r => matchName(werkzeug_wartungName!, [String(r.fields.werkzeugname ?? '')]));
          if (werkzeug_wartungMatch) merged['werkzeug_wartung'] = createRecordUrl(APP_IDS.WERKZEUGE, werkzeug_wartungMatch.record_id);
        }
        const verantwortlicherName = raw['verantwortlicher'] as string | null;
        if (verantwortlicherName) {
          const verantwortlicherMatch = handwerkerList.find(r => matchName(verantwortlicherName!, [[r.fields.vorname ?? '', r.fields.nachname ?? ''].filter(Boolean).join(' ')]));
          if (verantwortlicherMatch) merged['verantwortlicher'] = createRecordUrl(APP_IDS.HANDWERKER, verantwortlicherMatch.record_id);
        }
        return merged as Partial<WartungReparatur['fields']>;
      });
      // Upload scanned file to file fields
      if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
        try {
          const blob = dataUriToBlob(uri!);
          const fileUrl = await uploadFile(blob, file.name);
          setFields(prev => ({ ...prev, dokument: fileUrl }));
        } catch (uploadErr) {
          console.error('File upload failed:', uploadErr);
        }
      }
      setAiText('');
      setScanSuccess(true);
      setTimeout(() => setScanSuccess(false), 3000);
    } catch (err) {
      console.error(`${t('scan_error')}:`, err);
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleAiExtract(f);
    e.target.value = '';
  }

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf')) {
      handleAiExtract(file);
    }
  }, []);

  const DIALOG_INTENT = defaultValues
    ? t('edit_entity', { entity: appLabel('wartung_reparatur') })
    : t('new_entity', { entity: appLabel('wartung_reparatur') });

  const fieldBlocks: Record<string, React.ReactNode> = {
    'werkzeug_wartung': (
      <div key="werkzeug_wartung" className="space-y-1.5">
        <Label htmlFor="werkzeug_wartung">{fieldLabel('wartung_reparatur', 'werkzeug_wartung')} <span className="text-destructive" aria-hidden="true">*</span></Label>
        <Combobox
          id="werkzeug_wartung"
          placeholder="Welches Werkzeug wird gewartet?"
          items={werkzeugeListAll.map(r => ({
            id: r.record_id,
            label: String(r.fields.werkzeugname ?? r.record_id),
          }))}
          value={extractRecordId(fields.werkzeug_wartung)}
          onChange={id => setFields(f => ({ ...f, werkzeug_wartung: id ? createRecordUrl(APP_IDS.WERKZEUGE, id) : undefined }))}
          onCreateNew={(q) => openCreateWerkzeuge("werkzeug_wartung", q)}
          createLabel={t('create_in', { entity: appLabel('werkzeuge') })}
        />
        {showErrors && !fields.werkzeug_wartung && (
          <p className="text-xs text-destructive mt-1">{t('required_hint')}</p>
        )}
      </div>
    ),
    'vorgangsart': (
      <div key="vorgangsart" className="space-y-1.5">
        <Label htmlFor="vorgangsart">{fieldLabel('wartung_reparatur', 'vorgangsart')} <span className="text-destructive" aria-hidden="true">*</span></Label>
        <div role="radiogroup" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.vorgangsart) === 'wartung'}
            onClick={() => setFields(f => ({ ...f, vorgangsart: (lookupKey(f.vorgangsart) === 'wartung' ? undefined : 'wartung') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.vorgangsart) === 'wartung'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            {lookupLabel('wartung_reparatur', 'vorgangsart', 'wartung') ?? 'Wartung'}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.vorgangsart) === 'reparatur'}
            onClick={() => setFields(f => ({ ...f, vorgangsart: (lookupKey(f.vorgangsart) === 'reparatur' ? undefined : 'reparatur') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.vorgangsart) === 'reparatur'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            {lookupLabel('wartung_reparatur', 'vorgangsart', 'reparatur') ?? 'Reparatur'}
          </button>
        </div>
        {showErrors && !fields.vorgangsart && (
          <p className="text-xs text-destructive mt-1">{t('required_hint')}</p>
        )}
      </div>
    ),
    'verantwortlicher': (
      <div key="verantwortlicher" className="space-y-1.5">
        <Label htmlFor="verantwortlicher">{fieldLabel('wartung_reparatur', 'verantwortlicher')}</Label>
        <Combobox
          id="verantwortlicher"
          placeholder="Welcher Handwerker übernimmt es?"
          items={handwerkerListAll.map(r => ({
            id: r.record_id,
            label: String(r.fields.vorname ?? r.record_id),
          }))}
          value={extractRecordId(fields.verantwortlicher)}
          onChange={id => setFields(f => ({ ...f, verantwortlicher: id ? createRecordUrl(APP_IDS.HANDWERKER, id) : undefined }))}
          onCreateNew={(q) => openCreateHandwerker("verantwortlicher", q)}
          createLabel={t('create_in', { entity: appLabel('handwerker') })}
        />
      </div>
    ),
    'startdatum': (
      <div key="startdatum" className="space-y-1.5">
        <Label htmlFor="startdatum">{fieldLabel('wartung_reparatur', 'startdatum')} <span className="text-destructive" aria-hidden="true">*</span></Label>
        <DatePicker
          id="startdatum"
          placeholder="Wann startet der Vorgang?"
          mode="date"
          value={fields.startdatum ?? null}
          onChange={v => setFields(f => ({ ...f, startdatum: v ?? undefined }))}
          required
        />
        {showErrors && !fields.startdatum && (
          <p className="text-xs text-destructive mt-1">{t('required_hint')}</p>
        )}
      </div>
    ),
    'geplantes_enddatum': (
      <div key="geplantes_enddatum" className="space-y-1.5">
        <Label htmlFor="geplantes_enddatum">{fieldLabel('wartung_reparatur', 'geplantes_enddatum')}</Label>
        <DatePicker
          id="geplantes_enddatum"
          placeholder="Wann soll es fertig sein?"
          mode="date"
          value={fields.geplantes_enddatum ?? null}
          onChange={v => setFields(f => ({ ...f, geplantes_enddatum: v ?? undefined }))}
        />
      </div>
    ),
    'tatsaechliches_enddatum': (
      <div key="tatsaechliches_enddatum" className="space-y-1.5">
        <Label htmlFor="tatsaechliches_enddatum">{fieldLabel('wartung_reparatur', 'tatsaechliches_enddatum')}</Label>
        <DatePicker
          id="tatsaechliches_enddatum"
          placeholder="Wann war es tatsächlich fertig?"
          mode="date"
          value={fields.tatsaechliches_enddatum ?? null}
          onChange={v => setFields(f => ({ ...f, tatsaechliches_enddatum: v ?? undefined }))}
        />
      </div>
    ),
    'beschreibung': (
      <div key="beschreibung" className="space-y-1.5">
        <Label htmlFor="beschreibung">{fieldLabel('wartung_reparatur', 'beschreibung')}</Label>
        <Textarea
          id="beschreibung"
          placeholder="Was ist das Problem? Welche Maßnahmen werden durchgeführt?"
          value={fields.beschreibung ?? ''}
          onChange={e => setFields(f => ({ ...f, beschreibung: e.target.value }))}
          rows={3}
        />
      </div>
    ),
    'status_wartung': (
      <div key="status_wartung" className="space-y-1.5">
        <Label htmlFor="status_wartung">{fieldLabel('wartung_reparatur', 'status_wartung')} <span className="text-destructive" aria-hidden="true">*</span></Label>
        <div role="radiogroup" className="flex flex-wrap gap-1.5">
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.status_wartung) === 'geplant'}
            onClick={() => setFields(f => ({ ...f, status_wartung: (lookupKey(f.status_wartung) === 'geplant' ? undefined : 'geplant') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.status_wartung) === 'geplant'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            {lookupLabel('wartung_reparatur', 'status_wartung', 'geplant') ?? 'Geplant'}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.status_wartung) === 'in_bearbeitung'}
            onClick={() => setFields(f => ({ ...f, status_wartung: (lookupKey(f.status_wartung) === 'in_bearbeitung' ? undefined : 'in_bearbeitung') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.status_wartung) === 'in_bearbeitung'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            {lookupLabel('wartung_reparatur', 'status_wartung', 'in_bearbeitung') ?? 'In Bearbeitung'}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.status_wartung) === 'abgeschlossen'}
            onClick={() => setFields(f => ({ ...f, status_wartung: (lookupKey(f.status_wartung) === 'abgeschlossen' ? undefined : 'abgeschlossen') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.status_wartung) === 'abgeschlossen'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            {lookupLabel('wartung_reparatur', 'status_wartung', 'abgeschlossen') ?? 'Abgeschlossen'}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={lookupKey(fields.status_wartung) === 'abgebrochen'}
            onClick={() => setFields(f => ({ ...f, status_wartung: (lookupKey(f.status_wartung) === 'abgebrochen' ? undefined : 'abgebrochen') as any }))}
            className={`inline-flex items-center justify-center min-h-9 max-sm:min-h-11 max-sm:px-4 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              lookupKey(fields.status_wartung) === 'abgebrochen'
                ? 'bg-foreground text-background border-foreground'
                : 'bg-background text-foreground border-input hover:bg-accent'
            }`}
          >
            {lookupLabel('wartung_reparatur', 'status_wartung', 'abgebrochen') ?? 'Abgebrochen'}
          </button>
        </div>
        {showErrors && !fields.status_wartung && (
          <p className="text-xs text-destructive mt-1">{t('required_hint')}</p>
        )}
      </div>
    ),
    'kosten': (
      <div key="kosten" className="space-y-1.5">
        <Label htmlFor="kosten">{fieldLabel('wartung_reparatur', 'kosten')}</Label>
        <Input
          id="kosten"
          type="number"
          step="any"
          {...numberInputProps(formEnhancements, 'kosten')}
          placeholder="z. B. 150,00"
          value={fields.kosten !== undefined ? fields.kosten : (computedValues['kosten'] ?? '')}
          onChange={e => setFields(f => ({ ...f, kosten: clampNumberValue(formEnhancements, 'kosten', e.target.value) }))}
        />
      </div>
    ),
    'bemerkungen_wartung': (
      <div key="bemerkungen_wartung" className="space-y-1.5">
        <Label htmlFor="bemerkungen_wartung">{fieldLabel('wartung_reparatur', 'bemerkungen_wartung')}</Label>
        <Textarea
          id="bemerkungen_wartung"
          placeholder="Ersatzteile, Besonderheiten, Follow-ups..."
          value={fields.bemerkungen_wartung ?? ''}
          onChange={e => setFields(f => ({ ...f, bemerkungen_wartung: e.target.value }))}
          rows={3}
        />
      </div>
    ),
    'dokument': (
      <div key="dokument" className="space-y-1.5">
        <Label htmlFor="dokument">{fieldLabel('wartung_reparatur', 'dokument')}</Label>
        {fields.dokument ? (
          <div className="flex items-center gap-3 rounded-lg border p-2">
            <div className="relative h-14 w-14 shrink-0 rounded-md bg-muted overflow-hidden">
              <div className="absolute inset-0 flex items-center justify-center">
                <IconFileText size={20} className="text-muted-foreground" />
              </div>
              <img
                src={fields.dokument}
                alt=""
                className="relative h-full w-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate text-foreground">{fields.dokument.split("/").pop()}</p>
              <div className="flex gap-2 mt-1">
                <label
                  className="text-xs text-primary hover:underline cursor-pointer"
                >
                  {t('fr_change')}
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        const fileUrl = await uploadFile(file, file.name);
                        setFields(f => ({ ...f, dokument: fileUrl }));
                      } catch (err) { console.error('Upload failed:', err); }
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => setFields(f => ({ ...f, dokument: undefined }))}
                >
                  {t('fr_remove')}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <label
            className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
          >
            <IconUpload size={20} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t('fr_upload_file')}</span>
            <input
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const fileUrl = await uploadFile(file, file.name);
                  setFields(f => ({ ...f, dokument: fileUrl }));
                } catch (err) { console.error('Upload failed:', err); }
              }}
            />
          </label>
        )}
      </div>
    ),
  };
  const orderedFields = applyFieldOrder(Object.keys(fieldBlocks), formEnhancements.fieldOrder);
  const orderedFieldsKey = orderedFields.map((it) => typeof it === 'string' ? it : it.row.join('+')).join(',');

  // Render-Modell für Computed-Felder:
  //
  //   • BACKEND-FELDER mit computed-Eintrag (z.B. gesamtpreis bei einer
  //     Katzenpension) bleiben als normales Eingabe-Feld stehen. Der Number-
  //     Input nutzt den computed-Wert als Vorschlag, der User kann jederzeit
  //     überschreiben (clearing → restore computed).
  //   • VIRTUELLE computed-Keys (Eintrag in formEnhancements.computed, ABER
  //     kein passendes Backend-Feld in orderedFields) erscheinen NICHT als
  //     Input, sondern unten als kompakte 'Berechnungen'-Übersicht oder als
  //     Inline-Hint unter dem letzten beitragenden Input.
  const FIELD_LABELS: Record<string, string> = {"werkzeug_wartung": "Werkzeug", "vorgangsart": "Vorgangsart", "verantwortlicher": "Verantwortlicher Handwerker", "startdatum": "Startdatum", "geplantes_enddatum": "Geplantes Enddatum", "tatsaechliches_enddatum": "Tatsächliches Enddatum", "beschreibung": "Beschreibung des Problems / der Maßnahme", "status_wartung": "Status", "kosten": "Kosten (€)", "bemerkungen_wartung": "Bemerkungen", "dokument": "Dokument / Bericht"};
  const CURRENCY_KEYS = new Set<string>(["kosten"]);
  // Applookup-Referenz-Labels: pro applookup-Feld in dieser Form (ownKey)
  // eine Map { lookupKey: label } für ALLE Felder des Target-Schemas. Wird
  // beim Render-Walk gefiltert auf die in der computed-Formel tatsächlich
  // referenzierten lookupKeys (siehe applookupRefs unten).
  const APPLOOKUP_LABELS: Record<string, Record<string, string>> = {"werkzeug_wartung": {"werkzeugname": "Werkzeugname", "inventarnummer": "Inventarnummer", "kategorie": "Kategorie", "hersteller": "Hersteller", "modell": "Modell", "seriennummer": "Seriennummer", "anschaffungsdatum": "Anschaffungsdatum", "standort": "Standort / Lagerort", "zustand": "Aktueller Zustand", "foto": "Foto des Werkzeugs", "bemerkungen_werkzeug": "Bemerkungen"}, "verantwortlicher": {"vorname": "Vorname", "nachname": "Nachname", "personalnummer": "Personalnummer", "telefon": "Telefonnummer", "email": "E-Mail-Adresse", "abteilung": "Abteilung", "qualifikation": "Qualifikation / Rolle", "status": "Status", "bemerkungen": "Bemerkungen"}};
  const inputFields = useMemo(() => flattenFieldOrder(orderedFields), [orderedFieldsKey]);
  const backendFieldSet = useMemo(() => new Set(inputFields), [inputFields.join(',')]);
  const virtualComputed = useMemo(
    () => Object.fromEntries(
      Object.entries(formEnhancements.computed).filter(([k]) => !backendFieldSet.has(k)),
    ),
    [backendFieldSet],
  );
  const virtualFormEnhancements = useMemo(
    () => ({ ...formEnhancements, computed: virtualComputed }),
    [virtualComputed],
  );
  const computedLayout = useMemo(
    () => classifyComputed(virtualFormEnhancements, inputFields, computedDeps),
    [virtualFormEnhancements, inputFields.join(',')],
  );
  // Applookup-Referenzen: pro ownKey (Lookup-Feld im Form) die Liste der
  // lookupKeys, die in irgendeiner computed-Formel referenziert werden.
  // MODUS-1: aus dem Spec-Tree extrahiert. MODUS-2: aus dem Build-Time-
  // Export computedApplookupRefs (parse-formulas hat Regex-Pairs gesammelt).
  // Pro (ownKey, lookupKey)-Paar nur einmal; pro ownKey können aber mehrere
  // lookupKeys gleichzeitig auftauchen (z.B. einzelpreis UND karten10_preis
  // beim Yoga-Kurs), und alle werden separat als Inline-Hint gerendert.
  const applookupRefs = useMemo(
    () => mergeApplookupRefs(
      extractApplookupRefs(formEnhancements.computed),
      computedApplookupRefs,
    ),
    [],
  );
  function summaryLabel(k: string): string {
    if (FIELD_LABELS[k]) return FIELD_LABELS[k];
    // Leading underscore(s) als Virtual-Marker abstreifen; Unterstriche zu
    // Leerzeichen, jedes Wort kapitalisieren. Umlaute kommen vom Sub-Agent
    // direkt im Key (z. B. `_buchung_dauer_nächte`) — JS/TS/Vite unterstützen
    // Unicode-Identifier nativ, daher keine ASCII-Transliteration nötig.
    return k.replace(/^_+/, '')
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  function formatSummaryValue(k: string, v: unknown): string {
    if (v === undefined || v === null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) return '—';
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) return String(v);
    // Backend-Feld mit €-Label ODER virtueller Computed-Key, dessen Name nach Geld aussieht.
    const looksLikeCurrency = CURRENCY_KEYS.has(k) || /(?:kosten|preis|betrag|gesamt|netto|brutto|summe|mwst|rabatt|anzahlung|umsatz|saldo)/i.test(k);
    if (looksLikeCurrency) {
      return n.toLocaleString(localeTag(), { style: 'currency', currency: CURRENCY, minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return n.toLocaleString(localeTag(), { maximumFractionDigits: 2 });
  }

  return (
    <>
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[92vh] flex flex-col overflow-hidden p-0 gap-0 max-sm:[&>button]:size-10 max-sm:[&>button]:grid max-sm:[&>button]:place-items-center max-sm:[&>button]:rounded-full max-sm:[&>button]:border max-sm:[&>button]:border-input max-sm:[&>button]:bg-background max-sm:[&>button]:opacity-100 max-sm:[&>button>svg]:size-5">
        <DialogHeader className="px-6 pt-5 pb-3 border-b flex flex-row items-center gap-3 space-y-0">
          <DialogTitle className="flex-1 truncate text-left">{DIALOG_INTENT}</DialogTitle>
          {enablePhotoScan && (
            <button
              type="button"
              onClick={() => setAiOpen(o => !o)}
              aria-expanded={aiOpen}
              aria-controls="ai-fill-panel"
              className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 max-sm:py-2.5 max-sm:px-4 text-xs font-semibold transition-all mr-7 max-sm:mr-12 shadow-sm ${
                aiOpen
                  ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                  : 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/15 hover:border-primary/50'
              }`}
            >
              <IconSparkles className={`h-3.5 w-3.5 ${aiOpen ? '' : 'text-primary'}`} />
              <span className="hidden sm:inline">{t('smart_fill')}</span>
              <IconChevronDown className={`h-3 w-3 transition-transform ${aiOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </DialogHeader>
        {enablePhotoScan && aiOpen && (
          <div id="ai-fill-panel" className="border-b bg-muted/20 px-6 py-4 space-y-3">
            <p className="text-xs text-muted-foreground">{t('scan_header_sub')}</p>
            <div className="flex items-start gap-2 pl-0.5">
              <Checkbox
                id="ai-use-personal-info"
                checked={usePersonalInfo}
                onCheckedChange={(v) => setUsePersonalInfo(!!v)}
                className="mt-0.5"
              />
              <span className="text-xs text-muted-foreground leading-snug">
                <Label htmlFor="ai-use-personal-info" className="text-xs font-normal text-muted-foreground cursor-pointer inline">
                  {t('useinfo_label')}
                </Label>
                {' '}
                <button type="button" onClick={handleShowProfileInfo} className="text-xs text-primary hover:underline whitespace-nowrap">
                  {profileLoading ? t('useinfo_loading') : `(${t('useinfo_more')})`}
                </button>
              </span>
            </div>
            {showProfileInfo && (
              <div className="rounded-md border bg-muted/50 p-2 text-xs max-h-40 overflow-y-auto">
                <p className="font-medium mb-1">{t('profile_preamble')}</p>
                {profileData ? Object.values(profileData).map((v, i) => (
                  <span key={i}>{i > 0 && ", "}{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
                )) : (
                  <span className="text-muted-foreground">{t('useinfo_error')}</span>
                )}
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={handleFileSelect} />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileSelect} />

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !scanning && fileInputRef.current?.click()}
              className={`
                relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer
                ${scanning
                  ? 'border-primary/40 bg-primary/5'
                  : scanSuccess
                    ? 'border-green-500/40 bg-green-50/50 dark:bg-green-950/20'
                    : dragOver
                      ? 'border-primary bg-primary/10 scale-[1.01]'
                      : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'
                }
              `}
            >
              {scanning ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                    <IconLoader2 className="h-7 w-7 text-primary animate-spin" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">{t('scan_analyzing')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('scan_analyzing_sub')}</p>
                  </div>
                </div>
              ) : scanSuccess ? (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <IconCircleCheck className="h-7 w-7 text-green-600 dark:text-green-400" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-green-700 dark:text-green-400">{t('scan_success')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('scan_success_sub')}</p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 gap-3">
                  <div className="h-14 w-14 rounded-full bg-primary/8 flex items-center justify-center">
                    <IconPhotoPlus className="h-7 w-7 text-primary/70" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium">{t('scan_upload')}</p>
                  </div>
                </div>
              )}

              {preview && !scanning && (
                <div className="absolute top-2 right-2">
                  <div className="relative group">
                    <img src={preview} alt="" className="h-10 w-10 rounded-md object-cover border shadow-sm" />
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setPreview(null); }}
                      className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-muted-foreground/80 text-white flex items-center justify-center"
                    >
                      <IconX className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Button type="button" variant="outline" size="sm" className="h-10 text-xs" disabled={scanning}
                onClick={e => { e.stopPropagation(); cameraInputRef.current?.click(); }}>
                <IconCamera className="h-3.5 w-3.5 mr-1" />{t('scan_camera_btn')}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-10 text-xs" disabled={scanning}
                onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                <IconUpload className="h-3.5 w-3.5 mr-1" />{t('scan_file_btn')}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-10 text-xs" disabled={scanning}
                onClick={e => {
                  e.stopPropagation();
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = 'application/pdf,.pdf';
                    fileInputRef.current.click();
                    setTimeout(() => { if (fileInputRef.current) fileInputRef.current.accept = 'image/*,application/pdf'; }, 100);
                  }
                }}>
                <IconFileText className="h-3.5 w-3.5 mr-1" />{t('scan_doc_btn')}
              </Button>
            </div>

            <div className="relative">
              <Textarea
                placeholder={t('scan_text_placeholder')}
                value={aiText}
                onChange={e => {
                  setAiText(e.target.value);
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = Math.min(Math.max(el.scrollHeight, 56), 96) + 'px';
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && aiText.trim() && !scanning) {
                    e.preventDefault();
                    handleAiExtract();
                  }
                }}
                disabled={scanning}
                rows={2}
                className="pr-12 resize-none text-sm overflow-y-auto"
              />
              <button
                type="button"
                className="absolute right-2 top-2 h-8 w-8 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                disabled={scanning}
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) setAiText(prev => prev ? prev + '\n' + text : text);
                  } catch {}
                }}
                title={t('paste')}
              >
                <IconClipboard className="h-4 w-4" />
              </button>
            </div>
            {aiText.trim() && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full h-9 text-xs"
                disabled={scanning}
                onClick={() => handleAiExtract()}
              >
                <IconSparkles className="h-3.5 w-3.5 mr-1.5" />{t('scan_text_analyze')}
              </Button>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-1 flex-col min-h-0 min-w-0 max-sm:[&_input]:h-11">
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-4 space-y-4 min-w-0">
            {(() => {
              const renderField = (k: string) => {
                const inlineHints = computedLayout.anchors[k] ?? [];
                const refs = applookupRefs[k] ?? [];
                return (
                  <div key={k} className="space-y-1.5 min-w-0">
                    {fieldBlocks[k]}
                    {refs.map(({ lookupKey }) => {
                      // Show the live numeric value the formula will pull from
                      // the selected lookup target (e.g. "Monatspreis: 34,90 €"
                      // under the Tarif combobox). Hidden while no lookup is
                      // selected or the target field is non-numeric.
                      const v = resolveApplookupRef(k, lookupKey, fields as Record<string, unknown>, computedContext);
                      if (v === null) return null;
                      const lbl = APPLOOKUP_LABELS[k]?.[lookupKey] ?? lookupKey;
                      const text = formatSummaryValue(lookupKey, v);
                      return (
                        <div key={`alh-${k}-${lookupKey}`} className="flex items-center gap-1.5 pl-3 text-xs text-muted-foreground">
                          <span className="text-primary/70">→</span>
                          <span>{lbl}</span>
                          <span className="ml-auto font-medium tabular-nums text-foreground">{text}</span>
                        </div>
                      );
                    })}
                    {inlineHints.map((cKey) => {
                      const v = computedValues[cKey];
                      const text = formatSummaryValue(cKey, v);
                      if (text === '—') return null;
                      return (
                        <div key={cKey} className="flex items-center gap-1.5 pl-3 text-xs text-muted-foreground">
                          <span className="text-primary/70">→</span>
                          <span>{summaryLabel(cKey)}</span>
                          <span className="ml-auto font-medium tabular-nums text-foreground">{text}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              };
              return orderedFields.map((item, idx) => {
                if (typeof item === 'string') return renderField(item);
                const cols = item.cols ?? `repeat(${item.row.length}, minmax(0, 1fr))`;
                return (
                  <div key={`row-${idx}`} className="grid gap-3" style={{ gridTemplateColumns: cols }}>
                    {item.row.map(renderField)}
                  </div>
                );
              });
            })()}
            {(computedLayout.aggregates.length > 0 || computedLayout.finalTotal) && (
              <div className="mt-6 pt-4 border-t border-border space-y-1.5">
                {computedLayout.aggregates.length > 0 && (
                  <dl className="space-y-1.5 pb-2">
                    {computedLayout.aggregates.map((k) => {
                      const userVal = (fields as Record<string, unknown>)[k];
                      const computed = computedValues[k];
                      const v = userVal !== undefined && userVal !== null && userVal !== '' ? userVal : computed;
                      return (
                        <div key={k} className="flex justify-between items-baseline gap-3">
                          <dt className="text-sm text-muted-foreground truncate">{summaryLabel(k)}</dt>
                          <dd className="text-sm font-medium tabular-nums whitespace-nowrap">{formatSummaryValue(k, v)}</dd>
                        </div>
                      );
                    })}
                  </dl>
                )}
                {computedLayout.finalTotal && (() => {
                  const k = computedLayout.finalTotal;
                  const userVal = (fields as Record<string, unknown>)[k];
                  const computed = computedValues[k];
                  const v = userVal !== undefined && userVal !== null && userVal !== '' ? userVal : computed;
                  // Innere Border nur wenn aggregates existieren — sonst hätten wir
                  // zwei direkt aufeinanderfolgende Striche (Outer + Inner) mit nur
                  // einer Aggregat-Zeile dazwischen → zu viel visuelles Rauschen.
                  const sep = computedLayout.aggregates.length > 0 ? 'pt-3 border-t border-border' : 'pt-1';
                  return (
                    <div className={`flex justify-between items-baseline gap-3 ${sep}`}>
                      <span className="text-base font-semibold text-foreground">{summaryLabel(k)}</span>
                      <span className="text-lg font-bold tabular-nums whitespace-nowrap text-foreground">{formatSummaryValue(k, v)}</span>
                    </div>
                  );
                })()}
              </div>
            )}
            {showErrors && missingRequired.length > 0 && (
              <p className="text-xs text-destructive flex items-center gap-1.5" role="alert">
                <IconAlertCircle className="h-3.5 w-3.5 shrink-0" />
                {t('missing_required')}
              </p>
            )}
            {recordId && (
              <div className="pt-2 border-t border-border">
                <AttachmentsSection appId={APP_IDS.WARTUNG_REPARATUR} recordId={recordId} />
              </div>
            )}
          </div>
          {submitError && (
            <div className="flex items-start gap-2 border-t border-destructive/20 bg-destructive/10 px-6 py-2.5 text-sm text-destructive" role="alert">
              <IconAlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{submitError}</span>
            </div>
          )}
          <DialogFooter className="sticky bottom-0 border-t bg-background/95 backdrop-blur px-6 py-3 gap-2 max-sm:flex-row">
            <Button type="button" variant="outline" onClick={onClose} className="max-sm:h-12 max-sm:flex-1 max-sm:text-base">{t('cancel')}</Button>
            <Button
              type="submit"
              className="max-sm:h-12 max-sm:flex-1 max-sm:text-base"
              disabled={saving || !isDirty || (showErrors && missingRequired.length > 0)}
            >
              {saving ? t('saving') : defaultValues ? t('save') : t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    {createWerkzeugeOpen && (
      <WerkzeugeDialog
        open={createWerkzeugeOpen}
        onClose={() => setCreateWerkzeugeOpen(false)}
        onSubmit={async (newFields) => {
          const result = await LivingAppsService.createWerkzeugeEntry(newFields as any) as { id?: string };
          if (result?.id) {
            const newRec = { record_id: result.id, fields: newFields } as unknown as Werkzeuge;
            setExtraWerkzeuge(prev => [...prev, newRec]);
            const url = createRecordUrl(APP_IDS.WERKZEUGE, result.id);
            setFields(prev => ({ ...prev, [createWerkzeugeField]: url } as any));
          }
          setCreateWerkzeugeOpen(false);
        }}
        defaultValues={createWerkzeugeInitial
          ? ({ werkzeugname: createWerkzeugeInitial } as any)
          : undefined}
      />
    )}
    {createHandwerkerOpen && (
      <HandwerkerDialog
        open={createHandwerkerOpen}
        onClose={() => setCreateHandwerkerOpen(false)}
        onSubmit={async (newFields) => {
          const result = await LivingAppsService.createHandwerkerEntry(newFields as any) as { id?: string };
          if (result?.id) {
            const newRec = { record_id: result.id, fields: newFields } as unknown as Handwerker;
            setExtraHandwerker(prev => [...prev, newRec]);
            const url = createRecordUrl(APP_IDS.HANDWERKER, result.id);
            setFields(prev => ({ ...prev, [createHandwerkerField]: url } as any));
          }
          setCreateHandwerkerOpen(false);
        }}
        defaultValues={createHandwerkerInitial
          ? ({ vorname: createHandwerkerInitial } as any)
          : undefined}
      />
    )}
    </>
  );
}