import { useState, useMemo, useCallback } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Handwerker, Werkzeuge, Ausleihe, WartungReparatur } from '@/types/app';
import { LivingAppsService, extractRecordId, cleanFieldsForApi } from '@/services/livingAppsService';
import { HandwerkerDialog } from '@/components/dialogs/HandwerkerDialog';
import { HandwerkerViewDialog } from '@/components/dialogs/HandwerkerViewDialog';
import { WerkzeugeDialog } from '@/components/dialogs/WerkzeugeDialog';
import { WerkzeugeViewDialog } from '@/components/dialogs/WerkzeugeViewDialog';
import { AusleiheDialog } from '@/components/dialogs/AusleiheDialog';
import { AusleiheViewDialog } from '@/components/dialogs/AusleiheViewDialog';
import { WartungReparaturDialog } from '@/components/dialogs/WartungReparaturDialog';
import { WartungReparaturViewDialog } from '@/components/dialogs/WartungReparaturViewDialog';
import { BulkEditDialog } from '@/components/dialogs/BulkEditDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageShell } from '@/components/PageShell';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { IconPencil, IconTrash, IconPlus, IconFilter, IconX, IconArrowsUpDown, IconArrowUp, IconArrowDown, IconSearch, IconCopy, IconFileText } from '@tabler/icons-react';
import { t, appLabel, fieldLabels, lookupLabel, dateFnsLocale, dateFormat } from '@/i18n';
import { format, parseISO } from 'date-fns';

function fmtDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), dateFormat(), { locale: dateFnsLocale() }); } catch { return d; }
}

// Field metadata per entity for bulk edit and column filters. `label` is the
// BUILD-language fallback only — getFieldMeta() re-labels every entry (and every
// lookup option) through the runtime catalog before anything renders it.
const HANDWERKER_FIELDS = [
  { key: 'vorname', label: 'Vorname', type: 'string/text' },
  { key: 'nachname', label: 'Nachname', type: 'string/text' },
  { key: 'personalnummer', label: 'Personalnummer', type: 'string/text' },
  { key: 'telefon', label: 'Telefonnummer', type: 'string/tel' },
  { key: 'email', label: 'E-Mail-Adresse', type: 'string/email' },
  { key: 'abteilung', label: 'Abteilung', type: 'string/text' },
  { key: 'qualifikation', label: 'Qualifikation / Rolle', type: 'lookup/select', options: [{ key: 'elektriker', label: 'Elektriker' }, { key: 'meister', label: 'Meister' }, { key: 'geselle', label: 'Geselle' }, { key: 'auszubildender', label: 'Auszubildender' }, { key: 'techniker', label: 'Techniker' }] },
  { key: 'status', label: 'Status', type: 'lookup/radio', options: [{ key: 'aktiv', label: 'Aktiv' }, { key: 'inaktiv', label: 'Inaktiv' }] },
  { key: 'bemerkungen', label: 'Bemerkungen', type: 'string/textarea' },
];
const WERKZEUGE_FIELDS = [
  { key: 'werkzeugname', label: 'Werkzeugname', type: 'string/text' },
  { key: 'inventarnummer', label: 'Inventarnummer', type: 'string/text' },
  { key: 'kategorie', label: 'Kategorie', type: 'lookup/select', options: [{ key: 'messgeraet', label: 'Messgerät' }, { key: 'handwerkzeug', label: 'Handwerkzeug' }, { key: 'elektrowerkzeug', label: 'Elektrowerkzeug' }, { key: 'pruefgeraet', label: 'Prüfgerät' }, { key: 'sicherheitsausruestung', label: 'Sicherheitsausrüstung' }, { key: 'sonstiges', label: 'Sonstiges' }] },
  { key: 'hersteller', label: 'Hersteller', type: 'string/text' },
  { key: 'modell', label: 'Modell', type: 'string/text' },
  { key: 'seriennummer', label: 'Seriennummer', type: 'string/text' },
  { key: 'anschaffungsdatum', label: 'Anschaffungsdatum', type: 'date/date' },
  { key: 'standort', label: 'Standort / Lagerort', type: 'string/text' },
  { key: 'zustand', label: 'Aktueller Zustand', type: 'lookup/select', options: [{ key: 'verfuegbar', label: 'Verfügbar' }, { key: 'ausgeliehen', label: 'Ausgeliehen' }, { key: 'in_reparatur', label: 'In Reparatur' }, { key: 'in_wartung', label: 'In Wartung' }, { key: 'defekt', label: 'Defekt' }, { key: 'ausgemustert', label: 'Ausgemustert' }] },
  { key: 'foto', label: 'Foto des Werkzeugs', type: 'file' },
  { key: 'bemerkungen_werkzeug', label: 'Bemerkungen', type: 'string/textarea' },
];
const AUSLEIHE_FIELDS = [
  { key: 'werkzeug', label: 'Werkzeug', type: 'applookup/select', targetEntity: 'werkzeuge', targetAppId: 'WERKZEUGE', displayField: 'werkzeugname' },
  { key: 'handwerker', label: 'Handwerker', type: 'applookup/select', targetEntity: 'handwerker', targetAppId: 'HANDWERKER', displayField: 'vorname' },
  { key: 'ausleihdatum', label: 'Ausleihdatum und -uhrzeit', type: 'date/datetimeminute' },
  { key: 'geplantes_rueckgabedatum', label: 'Geplantes Rückgabedatum und -uhrzeit', type: 'date/datetimeminute' },
  { key: 'tatsaechliches_rueckgabedatum', label: 'Tatsächliches Rückgabedatum und -uhrzeit', type: 'date/datetimeminute' },
  { key: 'status_ausleihe', label: 'Status', type: 'lookup/radio', options: [{ key: 'ausgeliehen', label: 'Ausgeliehen' }, { key: 'zurueckgegeben', label: 'Zurückgegeben' }] },
  { key: 'bemerkungen_ausleihe', label: 'Bemerkungen', type: 'string/textarea' },
];
const WARTUNGREPARATUR_FIELDS = [
  { key: 'werkzeug_wartung', label: 'Werkzeug', type: 'applookup/select', targetEntity: 'werkzeuge', targetAppId: 'WERKZEUGE', displayField: 'werkzeugname' },
  { key: 'vorgangsart', label: 'Vorgangsart', type: 'lookup/radio', options: [{ key: 'wartung', label: 'Wartung' }, { key: 'reparatur', label: 'Reparatur' }] },
  { key: 'verantwortlicher', label: 'Verantwortlicher Handwerker', type: 'applookup/select', targetEntity: 'handwerker', targetAppId: 'HANDWERKER', displayField: 'vorname' },
  { key: 'startdatum', label: 'Startdatum', type: 'date/date' },
  { key: 'geplantes_enddatum', label: 'Geplantes Enddatum', type: 'date/date' },
  { key: 'tatsaechliches_enddatum', label: 'Tatsächliches Enddatum', type: 'date/date' },
  { key: 'beschreibung', label: 'Beschreibung des Problems / der Maßnahme', type: 'string/textarea' },
  { key: 'status_wartung', label: 'Status', type: 'lookup/select', options: [{ key: 'geplant', label: 'Geplant' }, { key: 'in_bearbeitung', label: 'In Bearbeitung' }, { key: 'abgeschlossen', label: 'Abgeschlossen' }, { key: 'abgebrochen', label: 'Abgebrochen' }] },
  { key: 'kosten', label: 'Kosten (€)', type: 'number' },
  { key: 'bemerkungen_wartung', label: 'Bemerkungen', type: 'string/textarea' },
  { key: 'dokument', label: 'Dokument / Bericht', type: 'file' },
];

const ENTITY_TABS = [
  { key: 'handwerker', pascal: 'Handwerker' },
  { key: 'werkzeuge', pascal: 'Werkzeuge' },
  { key: 'ausleihe', pascal: 'Ausleihe' },
  { key: 'wartung_reparatur', pascal: 'WartungReparatur' },
] as const;

type EntityKey = typeof ENTITY_TABS[number]['key'];

export default function AdminPage() {
  const data = useDashboardData();
  const { loading, error, fetchAll } = data;

  const [activeTab, setActiveTab] = useState<EntityKey>('handwerker');
  const [selectedIds, setSelectedIds] = useState<Record<EntityKey, Set<string>>>(() => ({
    'handwerker': new Set(),
    'werkzeuge': new Set(),
    'ausleihe': new Set(),
    'wartung_reparatur': new Set(),
  }));
  const [filters, setFilters] = useState<Record<EntityKey, Record<string, string>>>(() => ({
    'handwerker': {},
    'werkzeuge': {},
    'ausleihe': {},
    'wartung_reparatur': {},
  }));
  const [showFilters, setShowFilters] = useState(false);
  const [dialogState, setDialogState] = useState<{ entity: EntityKey; record: any } | null>(null);
  const [createEntity, setCreateEntity] = useState<EntityKey | null>(null);
  const [deleteTargets, setDeleteTargets] = useState<{ entity: EntityKey; ids: string[] } | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState<EntityKey | null>(null);
  const [viewState, setViewState] = useState<{ entity: EntityKey; record: any } | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [search, setSearch] = useState('');

  const getRecords = useCallback((entity: EntityKey) => {
    switch (entity) {
      case 'handwerker': return (data as any).handwerker as Handwerker[] ?? [];
      case 'werkzeuge': return (data as any).werkzeuge as Werkzeuge[] ?? [];
      case 'ausleihe': return (data as any).ausleihe as Ausleihe[] ?? [];
      case 'wartung_reparatur': return (data as any).wartungReparatur as WartungReparatur[] ?? [];
      default: return [];
    }
  }, [data]);

  const getLookupLists = useCallback((entity: EntityKey) => {
    const lists: Record<string, any[]> = {};
    switch (entity) {
      case 'ausleihe':
        lists.werkzeugeList = (data as any).werkzeuge ?? [];
        lists.handwerkerList = (data as any).handwerker ?? [];
        break;
      case 'wartung_reparatur':
        lists.werkzeugeList = (data as any).werkzeuge ?? [];
        lists.handwerkerList = (data as any).handwerker ?? [];
        break;
    }
    return lists;
  }, [data]);

  const getApplookupDisplay = useCallback((entity: EntityKey, fieldKey: string, url?: unknown) => {
    if (!url) return '—';
    const id = extractRecordId(url);
    if (!id) return '—';
    const lists = getLookupLists(entity);
    void fieldKey; // ensure used for noUnusedParameters
    if (entity === 'ausleihe' && fieldKey === 'werkzeug') {
      const match = (lists.werkzeugeList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.werkzeugname ?? '—';
    }
    if (entity === 'ausleihe' && fieldKey === 'handwerker') {
      const match = (lists.handwerkerList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.vorname ?? '—';
    }
    if (entity === 'wartung_reparatur' && fieldKey === 'werkzeug_wartung') {
      const match = (lists.werkzeugeList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.werkzeugname ?? '—';
    }
    if (entity === 'wartung_reparatur' && fieldKey === 'verantwortlicher') {
      const match = (lists.handwerkerList ?? []).find((r: any) => r.record_id === id);
      return match?.fields.vorname ?? '—';
    }
    return String(url);
  }, [getLookupLists]);

  // An EntityKey IS the app key, so the runtime catalog can re-label the static
  // field metadata on every render (the tree remounts on a language switch).
  // Only display labels change here — keys, types and option keys stay as built.
  const getFieldMeta = useCallback((entity: EntityKey) => {
    const raw: any[] = (() => {
      switch (entity) {
        case 'handwerker': return HANDWERKER_FIELDS as any[];
        case 'werkzeuge': return WERKZEUGE_FIELDS as any[];
        case 'ausleihe': return AUSLEIHE_FIELDS as any[];
        case 'wartung_reparatur': return WARTUNGREPARATUR_FIELDS as any[];
        default: return [];
      }
    })();
    const labels = fieldLabels(entity);
    return raw.map((f: any) => ({
      ...f,
      label: labels[f.key] ?? f.label,
      ...(f.options
        ? { options: f.options.map((o: any) => ({ ...o, label: lookupLabel(entity, f.key, o.key) ?? o.label })) }
        : {}),
    }));
  }, []);

  const getFilteredRecords = useCallback((entity: EntityKey) => {
    const records = getRecords(entity);
    const s = search.toLowerCase();
    const searched = !s ? records : records.filter((r: any) => {
      return Object.values(r.fields).some((v: any) => {
        if (v == null) return false;
        if (Array.isArray(v)) return v.some((item: any) => typeof item === 'object' && item !== null && 'label' in item ? String((item as any).label).toLowerCase().includes(s) : String(item).toLowerCase().includes(s));
        if (typeof v === 'object' && 'label' in (v as any)) return String((v as any).label).toLowerCase().includes(s);
        return String(v).toLowerCase().includes(s);
      });
    });
    const entityFilters = filters[entity] ?? {};
    const fieldMeta = getFieldMeta(entity);
    return searched.filter((r: any) => {
      return fieldMeta.every((fm: any) => {
        const fv = entityFilters[fm.key];
        if (!fv || fv === '') return true;
        const val = r.fields?.[fm.key];
        if (fm.type === 'bool') {
          if (fv === 'true') return val === true;
          if (fv === 'false') return val !== true;
          return true;
        }
        if (fm.type === 'lookup/select' || fm.type === 'lookup/radio') {
          // The filter select carries the option KEY, which is locale-independent —
          // the record's own label is in the build language and must not be matched.
          const key = val && typeof val === 'object' && 'key' in val ? val.key : '';
          return String(key) === fv;
        }
        if (fm.type.includes('multiplelookup')) {
          if (!Array.isArray(val)) return false;
          return val.some((item: any) => String(lookupLabel(entity, fm.key, item?.key) ?? item?.label ?? '').toLowerCase().includes(fv.toLowerCase()));
        }
        if (fm.type.includes('applookup')) {
          const display = getApplookupDisplay(entity, fm.key, val);
          return String(display).toLowerCase().includes(fv.toLowerCase());
        }
        return String(val ?? '').toLowerCase().includes(fv.toLowerCase());
      });
    });
  }, [getRecords, filters, getFieldMeta, getApplookupDisplay, search]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === 'asc') setSortDir('desc');
      else { setSortKey(''); setSortDir('asc'); }
    } else { setSortKey(key); setSortDir('asc'); }
  }

  function sortRecords<T extends { fields: Record<string, any> }>(recs: T[]): T[] {
    if (!sortKey) return recs;
    return [...recs].sort((a, b) => {
      let va: any = a.fields[sortKey], vb: any = b.fields[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'object' && 'label' in va) va = va.label;
      if (typeof vb === 'object' && 'label' in vb) vb = vb.label;
      if (typeof va === 'number' && typeof vb === 'number') return sortDir === 'asc' ? va - vb : vb - va;
      return sortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
  }

  const toggleSelect = useCallback((entity: EntityKey, id: string) => {
    setSelectedIds(prev => {
      const next = { ...prev, [entity]: new Set(prev[entity]) };
      if (next[entity].has(id)) next[entity].delete(id);
      else next[entity].add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback((entity: EntityKey) => {
    const filtered = getFilteredRecords(entity);
    setSelectedIds(prev => {
      const allSelected = filtered.every((r: any) => prev[entity].has(r.record_id));
      const next = { ...prev, [entity]: new Set(prev[entity]) };
      if (allSelected) {
        filtered.forEach((r: any) => next[entity].delete(r.record_id));
      } else {
        filtered.forEach((r: any) => next[entity].add(r.record_id));
      }
      return next;
    });
  }, [getFilteredRecords]);

  const clearSelection = useCallback((entity: EntityKey) => {
    setSelectedIds(prev => ({ ...prev, [entity]: new Set() }));
  }, []);

  const getServiceMethods = useCallback((entity: EntityKey) => {
    switch (entity) {
      case 'handwerker': return {
        create: (fields: any) => LivingAppsService.createHandwerkerEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateHandwerkerEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteHandwerkerEntry(id),
      };
      case 'werkzeuge': return {
        create: (fields: any) => LivingAppsService.createWerkzeugeEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateWerkzeugeEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteWerkzeugeEntry(id),
      };
      case 'ausleihe': return {
        create: (fields: any) => LivingAppsService.createAusleiheEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateAusleiheEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteAusleiheEntry(id),
      };
      case 'wartung_reparatur': return {
        create: (fields: any) => LivingAppsService.createWartungReparaturEntry(fields),
        update: (id: string, fields: any) => LivingAppsService.updateWartungReparaturEntry(id, fields),
        remove: (id: string) => LivingAppsService.deleteWartungReparaturEntry(id),
      };
      default: return null;
    }
  }, []);

  async function handleCreate(entity: EntityKey, fields: any) {
    const svc = getServiceMethods(entity);
    if (!svc) return;
    await svc.create(fields);
    fetchAll();
    setCreateEntity(null);
  }

  async function handleUpdate(fields: any) {
    if (!dialogState) return;
    const svc = getServiceMethods(dialogState.entity);
    if (!svc) return;
    await svc.update(dialogState.record.record_id, fields);
    fetchAll();
    setDialogState(null);
  }

  async function handleBulkDelete() {
    if (!deleteTargets) return;
    const svc = getServiceMethods(deleteTargets.entity);
    if (!svc) return;
    setBulkLoading(true);
    try {
      for (const id of deleteTargets.ids) {
        await svc.remove(id);
      }
      clearSelection(deleteTargets.entity);
      fetchAll();
    } finally {
      setBulkLoading(false);
      setDeleteTargets(null);
    }
  }

  async function handleBulkClone() {
    const svc = getServiceMethods(activeTab);
    if (!svc) return;
    setBulkLoading(true);
    try {
      const records = getRecords(activeTab);
      const ids = Array.from(selectedIds[activeTab]);
      for (const id of ids) {
        const rec = records.find((r: any) => r.record_id === id);
        if (!rec) continue;
        const clean = cleanFieldsForApi(rec.fields, activeTab);
        await svc.create(clean as any);
      }
      clearSelection(activeTab);
      fetchAll();
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkEdit(fieldKey: string, value: any) {
    if (!bulkEditOpen) return;
    const svc = getServiceMethods(bulkEditOpen);
    if (!svc) return;
    setBulkLoading(true);
    try {
      const ids = Array.from(selectedIds[bulkEditOpen]);
      for (const id of ids) {
        await svc.update(id, { [fieldKey]: value });
      }
      clearSelection(bulkEditOpen);
      fetchAll();
    } finally {
      setBulkLoading(false);
      setBulkEditOpen(null);
    }
  }

  function updateFilter(entity: EntityKey, fieldKey: string, value: string) {
    setFilters(prev => ({
      ...prev,
      [entity]: { ...prev[entity], [fieldKey]: value },
    }));
  }

  function clearEntityFilters(entity: EntityKey) {
    setFilters(prev => ({ ...prev, [entity]: {} }));
  }

  const activeFilterCount = useMemo(() => {
    const f = filters[activeTab] ?? {};
    return Object.values(f).filter(v => v && v !== '').length;
  }, [filters, activeTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <p className="text-destructive">{error.message}</p>
        <Button onClick={fetchAll}>{t('retry')}</Button>
      </div>
    );
  }

  const filtered = getFilteredRecords(activeTab);
  const sel = selectedIds[activeTab];
  const allFiltered = filtered.every((r: any) => sel.has(r.record_id)) && filtered.length > 0;
  const fieldMeta = getFieldMeta(activeTab);

  return (
    <PageShell
      title={t('admin')}
      subtitle={t('admin_subtitle')}
      action={
        <Button onClick={() => setCreateEntity(activeTab)} className="shrink-0">
          <IconPlus className="h-4 w-4 mr-2" /> {t('add')}
        </Button>
      }
    >
      <div className="flex gap-2 flex-wrap">
        {ENTITY_TABS.map(tab => {
          const count = getRecords(tab.key).length;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setSearch(''); setSortKey(''); setSortDir('asc'); fetchAll(); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === tab.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {appLabel(tab.key)}
              <Badge variant="secondary" className="ml-1 text-xs">{count}</Badge>
            </button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="relative w-full max-w-sm">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowFilters(f => !f)} className="gap-2">
            <IconFilter className="h-4 w-4" />
            {t('filter')}
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-1">{activeFilterCount}</Badge>
            )}
          </Button>
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => clearEntityFilters(activeTab)}>
              {t('clear_filters')}
            </Button>
          )}
        </div>
        {sel.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap bg-muted/60 rounded-lg px-3 py-1.5">
            <span className="text-sm font-medium">{sel.size} {t('selected')}</span>
            <Button variant="outline" size="sm" onClick={() => setBulkEditOpen(activeTab)}>
              <IconPencil className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">{t('bulk_edit')}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkClone()}>
              <IconCopy className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">{t('bulk_clone')}</span>
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setDeleteTargets({ entity: activeTab, ids: Array.from(sel) })}>
              <IconTrash className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">{t('bulk_delete')}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => clearSelection(activeTab)}>
              <IconX className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">{t('deselect_all')}</span>
            </Button>
          </div>
        )}
      </div>

      {showFilters && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 p-4 rounded-lg border bg-muted/30">
          {fieldMeta.map((fm: any) => (
            <div key={fm.key} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{fm.label}</label>
              {fm.type === 'bool' ? (
                <Select value={filters[activeTab]?.[fm.key] ?? ''} onValueChange={v => updateFilter(activeTab, fm.key, v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('all_values')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all_values')}</SelectItem>
                    <SelectItem value="true">{t('yes')}</SelectItem>
                    <SelectItem value="false">{t('no')}</SelectItem>
                  </SelectContent>
                </Select>
              ) : fm.type === 'lookup/select' || fm.type === 'lookup/radio' ? (
                <Select value={filters[activeTab]?.[fm.key] ?? ''} onValueChange={v => updateFilter(activeTab, fm.key, v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('all_values')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('all_values')}</SelectItem>
                    {fm.options?.map((o: any) => (
                      <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-8 text-xs"
                  placeholder={`${t('filter')}...`}
                  value={filters[activeTab]?.[fm.key] ?? ''}
                  onChange={e => updateFilter(activeTab, fm.key, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-[27px] bg-card shadow-lg overflow-x-auto">
        <Table className="[&_tbody_td]:px-6 [&_tbody_td]:py-2 [&_tbody_td]:text-base [&_tbody_td]:font-medium [&_tbody_tr:first-child_td]:pt-6 [&_tbody_tr:last-child_td]:pb-10">
          <TableHeader className="bg-secondary">
            <TableRow className="border-b border-input">
              <TableHead className="w-10 px-6">
                <Checkbox
                  checked={allFiltered}
                  onCheckedChange={() => toggleSelectAll(activeTab)}
                />
              </TableHead>
              {fieldMeta.map((fm: any) => (
                <TableHead key={fm.key} className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort(fm.key)}>
                  <span className="inline-flex items-center gap-1">
                    {fm.label}
                    {sortKey === fm.key ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                  </span>
                </TableHead>
              ))}
              <TableHead className="w-24 uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortRecords(filtered).map((record: any) => (
              <TableRow key={record.record_id} className={`transition-colors cursor-pointer ${sel.has(record.record_id) ? "bg-primary/5" : "hover:bg-muted/50"}`} onClick={(e) => { if ((e.target as HTMLElement).closest('button, [role="checkbox"]')) return; setViewState({ entity: activeTab, record }); }}>
                <TableCell>
                  <Checkbox
                    checked={sel.has(record.record_id)}
                    onCheckedChange={() => toggleSelect(activeTab, record.record_id)}
                  />
                </TableCell>
                {fieldMeta.map((fm: any) => {
                  const val = record.fields?.[fm.key];
                  if (fm.type === 'bool') {
                    return (
                      <TableCell key={fm.key}>
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                          val ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                        }`}>
                          {val ? t('yes') : t('no')}
                        </span>
                      </TableCell>
                    );
                  }
                  if (fm.type === 'lookup/select' || fm.type === 'lookup/radio') {
                    return <TableCell key={fm.key}><span className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{lookupLabel(activeTab, fm.key, val?.key) ?? val?.label ?? '—'}</span></TableCell>;
                  }
                  if (fm.type.startsWith('multiplelookup')) {
                    return <TableCell key={fm.key}>{Array.isArray(val) ? val.map((v: any) => lookupLabel(activeTab, fm.key, v?.key) ?? v?.label ?? v).join(', ') : '—'}</TableCell>;
                  }
                  if (fm.type.startsWith('multipleapplookup')) {
                    return (
                      <TableCell key={fm.key}>
                        {Array.isArray(val) && val.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {val.map((url: any, i: number) => (
                              <span key={i} className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{getApplookupDisplay(activeTab, fm.key, url)}</span>
                            ))}
                          </div>
                        ) : '—'}
                      </TableCell>
                    );
                  }
                  if (fm.type.startsWith('applookup')) {
                    return <TableCell key={fm.key}><span className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{getApplookupDisplay(activeTab, fm.key, val)}</span></TableCell>;
                  }
                  if (fm.type.includes('date')) {
                    return <TableCell key={fm.key} className="text-muted-foreground">{fmtDate(val)}</TableCell>;
                  }
                  if (fm.type.startsWith('file')) {
                    return (
                      <TableCell key={fm.key}>
                        {val ? (
                          <div className="relative h-8 w-8 rounded bg-muted overflow-hidden">
                            <img src={val} alt="" className="h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          </div>
                        ) : '—'}
                      </TableCell>
                    );
                  }
                  if (fm.type === 'string/textarea') {
                    return <TableCell key={fm.key} className="max-w-xs"><span className="truncate block">{val ?? '—'}</span></TableCell>;
                  }
                  if (fm.type === 'geo') {
                    return (
                      <TableCell key={fm.key} className="max-w-[200px]">
                        <span className="truncate block" title={val ? `${val.lat}, ${val.long}` : undefined}>
                          {val?.info ?? (val ? `${val.lat?.toFixed(4)}, ${val.long?.toFixed(4)}` : '—')}
                        </span>
                      </TableCell>
                    );
                  }
                  return <TableCell key={fm.key}>{val ?? '—'}</TableCell>;
                })}
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setDialogState({ entity: activeTab, record })}>
                      <IconPencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTargets({ entity: activeTab, ids: [record.record_id] })}>
                      <IconTrash className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={fieldMeta.length + 2} className="text-center py-16 text-muted-foreground">
                  {t('no_results')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {(createEntity === 'handwerker' || dialogState?.entity === 'handwerker') && (
        <HandwerkerDialog
          open={createEntity === 'handwerker' || dialogState?.entity === 'handwerker'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'handwerker' ? handleUpdate : (fields: any) => handleCreate('handwerker', fields)}
          defaultValues={dialogState?.entity === 'handwerker' ? dialogState.record?.fields : undefined}
          enablePhotoScan={AI_PHOTO_SCAN['Handwerker']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Handwerker']}
        />
      )}
      {(createEntity === 'werkzeuge' || dialogState?.entity === 'werkzeuge') && (
        <WerkzeugeDialog
          open={createEntity === 'werkzeuge' || dialogState?.entity === 'werkzeuge'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'werkzeuge' ? handleUpdate : (fields: any) => handleCreate('werkzeuge', fields)}
          defaultValues={dialogState?.entity === 'werkzeuge' ? dialogState.record?.fields : undefined}
          enablePhotoScan={AI_PHOTO_SCAN['Werkzeuge']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Werkzeuge']}
        />
      )}
      {(createEntity === 'ausleihe' || dialogState?.entity === 'ausleihe') && (
        <AusleiheDialog
          open={createEntity === 'ausleihe' || dialogState?.entity === 'ausleihe'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'ausleihe' ? handleUpdate : (fields: any) => handleCreate('ausleihe', fields)}
          defaultValues={dialogState?.entity === 'ausleihe' ? dialogState.record?.fields : undefined}
          werkzeugeList={(data as any).werkzeuge ?? []}
          handwerkerList={(data as any).handwerker ?? []}
          enablePhotoScan={AI_PHOTO_SCAN['Ausleihe']}
          enablePhotoLocation={AI_PHOTO_LOCATION['Ausleihe']}
        />
      )}
      {(createEntity === 'wartung_reparatur' || dialogState?.entity === 'wartung_reparatur') && (
        <WartungReparaturDialog
          open={createEntity === 'wartung_reparatur' || dialogState?.entity === 'wartung_reparatur'}
          onClose={() => { setCreateEntity(null); setDialogState(null); }}
          onSubmit={dialogState?.entity === 'wartung_reparatur' ? handleUpdate : (fields: any) => handleCreate('wartung_reparatur', fields)}
          defaultValues={dialogState?.entity === 'wartung_reparatur' ? dialogState.record?.fields : undefined}
          werkzeugeList={(data as any).werkzeuge ?? []}
          handwerkerList={(data as any).handwerker ?? []}
          enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
          enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
        />
      )}
      {viewState?.entity === 'handwerker' && (
        <HandwerkerViewDialog
          open={viewState?.entity === 'handwerker'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'handwerker', record: r }); }}
        />
      )}
      {viewState?.entity === 'werkzeuge' && (
        <WerkzeugeViewDialog
          open={viewState?.entity === 'werkzeuge'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'werkzeuge', record: r }); }}
        />
      )}
      {viewState?.entity === 'ausleihe' && (
        <AusleiheViewDialog
          open={viewState?.entity === 'ausleihe'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'ausleihe', record: r }); }}
          werkzeugeList={(data as any).werkzeuge ?? []}
          handwerkerList={(data as any).handwerker ?? []}
        />
      )}
      {viewState?.entity === 'wartung_reparatur' && (
        <WartungReparaturViewDialog
          open={viewState?.entity === 'wartung_reparatur'}
          onClose={() => setViewState(null)}
          record={viewState?.record}
          onEdit={(r: any) => { setViewState(null); setDialogState({ entity: 'wartung_reparatur', record: r }); }}
          werkzeugeList={(data as any).werkzeuge ?? []}
          handwerkerList={(data as any).handwerker ?? []}
        />
      )}

      <BulkEditDialog
        open={!!bulkEditOpen}
        onClose={() => setBulkEditOpen(null)}
        onApply={handleBulkEdit}
        fields={bulkEditOpen ? getFieldMeta(bulkEditOpen) : []}
        selectedCount={bulkEditOpen ? selectedIds[bulkEditOpen].size : 0}
        loading={bulkLoading}
        lookupLists={bulkEditOpen ? getLookupLists(bulkEditOpen) : {}}
      />

      <ConfirmDialog
        open={!!deleteTargets}
        onClose={() => setDeleteTargets(null)}
        onConfirm={handleBulkDelete}
        title={t('bulk_delete')}
        description={t('confirm_bulk_delete', { n: deleteTargets?.ids.length ?? 0 })}
      />
    </PageShell>
  );
}