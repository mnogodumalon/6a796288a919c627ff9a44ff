import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import type { WartungReparatur, Werkzeuge, Handwerker } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { IconPencil, IconTrash, IconPlus, IconSearch, IconArrowsUpDown, IconArrowUp, IconArrowDown, IconFileText } from '@tabler/icons-react';
import { WartungReparaturDialog } from '@/components/dialogs/WartungReparaturDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageShell } from '@/components/PageShell';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { t, appLabel, fieldLabel, lookupLabel, dateFnsLocale, dateFormat } from '@/i18n';
import { format, parseISO } from 'date-fns';

function formatDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), dateFormat(), { locale: dateFnsLocale() }); } catch { return d; }
}

export default function WartungReparaturPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState<WartungReparatur[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<WartungReparatur | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WartungReparatur | null>(null);
  const [sortKey, setSortKey] = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [werkzeugeList, setWerkzeugeList] = useState<Werkzeuge[]>([]);
  const [handwerkerList, setHandwerkerList] = useState<Handwerker[]>([]);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [mainData, werkzeugeData, handwerkerData] = await Promise.all([
        LivingAppsService.getWartungReparatur(),
        LivingAppsService.getWerkzeuge(),
        LivingAppsService.getHandwerker(),
      ]);
      setRecords(mainData);
      setWerkzeugeList(werkzeugeData);
      setHandwerkerList(handwerkerData);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(fields: WartungReparatur['fields']) {
    await LivingAppsService.createWartungReparaturEntry(fields);
    await loadData();
    setDialogOpen(false);
  }

  async function handleUpdate(fields: WartungReparatur['fields']) {
    if (!editingRecord) return;
    await LivingAppsService.updateWartungReparaturEntry(editingRecord.record_id, fields);
    await loadData();
    setEditingRecord(null);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await LivingAppsService.deleteWartungReparaturEntry(deleteTarget.record_id);
    setRecords(prev => prev.filter(r => r.record_id !== deleteTarget.record_id));
    setDeleteTarget(null);
  }

  function getWerkzeugeDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return werkzeugeList.find(r => r.record_id === id)?.fields.werkzeugname ?? '—';
  }

  function getHandwerkerDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return handwerkerList.find(r => r.record_id === id)?.fields.vorname ?? '—';
  }

  const filtered = records.filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return Object.values(r.fields).some(v => {
      if (v == null) return false;
      if (Array.isArray(v)) return v.some(item => typeof item === 'object' && item !== null && 'label' in item ? String((item as any).label).toLowerCase().includes(s) : String(item).toLowerCase().includes(s));
      if (typeof v === 'object' && 'label' in (v as any)) return String((v as any).label).toLowerCase().includes(s);
      return String(v).toLowerCase().includes(s);
    });
  });

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <PageShell
      title={appLabel('wartung_reparatur')}
      subtitle={`${records.length} ${t('in_system', { entity: appLabel('wartung_reparatur') })}`}
      action={
        <Button onClick={() => setDialogOpen(true)} className="shrink-0 rounded-full shadow-sm">
          <IconPlus className="h-4 w-4 mr-2" /> {t('add')}
        </Button>
      }
    >
      <div className="relative w-full max-w-sm">
        <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('search_entity', { entity: appLabel('wartung_reparatur') })}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="rounded-[27px] bg-card shadow-lg overflow-hidden">
        <Table className="[&_tbody_td]:px-6 [&_tbody_td]:py-2 [&_tbody_td]:text-base [&_tbody_td]:font-medium [&_tbody_tr:first-child_td]:pt-6 [&_tbody_tr:last-child_td]:pb-10">
          <TableHeader className="bg-secondary">
            <TableRow className="border-b border-input">
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('werkzeug_wartung')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('wartung_reparatur', 'werkzeug_wartung')}
                  {sortKey === 'werkzeug_wartung' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('vorgangsart')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('wartung_reparatur', 'vorgangsart')}
                  {sortKey === 'vorgangsart' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('verantwortlicher')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('wartung_reparatur', 'verantwortlicher')}
                  {sortKey === 'verantwortlicher' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('startdatum')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('wartung_reparatur', 'startdatum')}
                  {sortKey === 'startdatum' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('geplantes_enddatum')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('wartung_reparatur', 'geplantes_enddatum')}
                  {sortKey === 'geplantes_enddatum' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('tatsaechliches_enddatum')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('wartung_reparatur', 'tatsaechliches_enddatum')}
                  {sortKey === 'tatsaechliches_enddatum' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('beschreibung')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('wartung_reparatur', 'beschreibung')}
                  {sortKey === 'beschreibung' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('status_wartung')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('wartung_reparatur', 'status_wartung')}
                  {sortKey === 'status_wartung' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('kosten')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('wartung_reparatur', 'kosten')}
                  {sortKey === 'kosten' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('bemerkungen_wartung')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('wartung_reparatur', 'bemerkungen_wartung')}
                  {sortKey === 'bemerkungen_wartung' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6 cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => toggleSort('dokument')}>
                <span className="inline-flex items-center gap-1">
                  {fieldLabel('wartung_reparatur', 'dokument')}
                  {sortKey === 'dokument' ? (sortDir === 'asc' ? <IconArrowUp size={14} /> : <IconArrowDown size={14} />) : <IconArrowsUpDown size={14} className="opacity-30" />}
                </span>
              </TableHead>
              <TableHead className="w-24 uppercase text-xs font-semibold text-secondary-foreground tracking-wider px-6">{t('actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortRecords(filtered).map(record => (
              <TableRow key={record.record_id} className="hover:bg-muted/50 transition-colors cursor-pointer" onClick={(e) => { if ((e.target as HTMLElement).closest('button, [role="checkbox"]')) return; navigate(`/wartung-reparatur/${record.record_id}`); }}>
                <TableCell><span className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{getWerkzeugeDisplayName(record.fields.werkzeug_wartung)}</span></TableCell>
                <TableCell><span className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{lookupLabel('wartung_reparatur', 'vorgangsart', record.fields.vorgangsart?.key) ?? record.fields.vorgangsart?.label ?? '—'}</span></TableCell>
                <TableCell><span className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{getHandwerkerDisplayName(record.fields.verantwortlicher)}</span></TableCell>
                <TableCell className="text-muted-foreground">{formatDate(record.fields.startdatum)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(record.fields.geplantes_enddatum)}</TableCell>
                <TableCell className="text-muted-foreground">{formatDate(record.fields.tatsaechliches_enddatum)}</TableCell>
                <TableCell className="max-w-xs"><span className="truncate block">{record.fields.beschreibung ?? '—'}</span></TableCell>
                <TableCell><span className="inline-flex items-center bg-secondary border border-[#bfdbfe] text-[#2563eb] rounded-[10px] px-2 py-1 text-sm font-medium">{lookupLabel('wartung_reparatur', 'status_wartung', record.fields.status_wartung?.key) ?? record.fields.status_wartung?.label ?? '—'}</span></TableCell>
                <TableCell>{record.fields.kosten ?? '—'}</TableCell>
                <TableCell className="max-w-xs"><span className="truncate block">{record.fields.bemerkungen_wartung ?? '—'}</span></TableCell>
                <TableCell>{record.fields.dokument ? <div className="relative h-8 w-8 rounded bg-muted overflow-hidden"><div className="absolute inset-0 flex items-center justify-center"><IconFileText size={14} className="text-muted-foreground" /></div><img src={record.fields.dokument} alt="" className="relative h-full w-full object-cover" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /></div> : '—'}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditingRecord(record)}>
                      <IconPencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(record)}>
                      <IconTrash className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-16 text-muted-foreground">
                  {search ? t('no_results') : t('no_data_yet', { entity: appLabel('wartung_reparatur') })}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <WartungReparaturDialog
        open={dialogOpen || !!editingRecord}
        onClose={() => { setDialogOpen(false); setEditingRecord(null); }}
        onSubmit={editingRecord ? handleUpdate : handleCreate}
        defaultValues={editingRecord?.fields}
        recordId={editingRecord?.record_id}
        werkzeugeList={werkzeugeList}
        handwerkerList={handwerkerList}
        enablePhotoScan={AI_PHOTO_SCAN['WartungReparatur']}
        enablePhotoLocation={AI_PHOTO_LOCATION['WartungReparatur']}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t('delete_entity', { entity: appLabel('wartung_reparatur') })}
        description={t('confirm_delete_desc')}
      />

    </PageShell>
  );
}