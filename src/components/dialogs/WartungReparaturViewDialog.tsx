import type { WartungReparatur, Werkzeuge, Handwerker } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { APP_IDS } from '@/types/app';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { MediaThumbnail } from '@/components/widgets/MediaViewer';
import { Badge } from '@/components/ui/badge';
import { IconPencil, IconFileText } from '@tabler/icons-react';
import { t, appLabel, fieldLabel, lookupLabel, dateFnsLocale, dateFormat } from '@/i18n';
import { format, parseISO } from 'date-fns';

function formatDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), dateFormat(), { locale: dateFnsLocale() }); } catch { return d; }
}

interface WartungReparaturViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: WartungReparatur | null;
  onEdit: (record: WartungReparatur) => void;
  werkzeugeList: Werkzeuge[];
  handwerkerList: Handwerker[];
}

export function WartungReparaturViewDialog({ open, onClose, record, onEdit, werkzeugeList, handwerkerList }: WartungReparaturViewDialogProps) {
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

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('view_entity', { entity: appLabel('wartung_reparatur') })}</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            {t('edit_button')}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('wartung_reparatur', 'werkzeug_wartung')}</Label>
            <p className="text-sm">{getWerkzeugeDisplayName(record.fields.werkzeug_wartung)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('wartung_reparatur', 'vorgangsart')}</Label>
            <Badge variant="secondary">{lookupLabel('wartung_reparatur', 'vorgangsart', record.fields.vorgangsart?.key) ?? record.fields.vorgangsart?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('wartung_reparatur', 'verantwortlicher')}</Label>
            <p className="text-sm">{getHandwerkerDisplayName(record.fields.verantwortlicher)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('wartung_reparatur', 'startdatum')}</Label>
            <p className="text-sm">{formatDate(record.fields.startdatum)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('wartung_reparatur', 'geplantes_enddatum')}</Label>
            <p className="text-sm">{formatDate(record.fields.geplantes_enddatum)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('wartung_reparatur', 'tatsaechliches_enddatum')}</Label>
            <p className="text-sm">{formatDate(record.fields.tatsaechliches_enddatum)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('wartung_reparatur', 'beschreibung')}</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.beschreibung ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('wartung_reparatur', 'status_wartung')}</Label>
            <Badge variant="secondary">{lookupLabel('wartung_reparatur', 'status_wartung', record.fields.status_wartung?.key) ?? record.fields.status_wartung?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('wartung_reparatur', 'kosten')}</Label>
            <p className="text-sm">{record.fields.kosten ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('wartung_reparatur', 'bemerkungen_wartung')}</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.bemerkungen_wartung ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('wartung_reparatur', 'dokument')}</Label>
            {record.fields.dokument ? (
              <MediaThumbnail src={record.fields.dokument} fit="contain" className="w-full rounded-lg border" />
            ) : <p className="text-sm text-muted-foreground">—</p>}
          </div>
          <div className="pt-2 border-t border-border">
            <AttachmentsSection appId={APP_IDS.WARTUNG_REPARATUR} recordId={record.record_id} readOnly />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}