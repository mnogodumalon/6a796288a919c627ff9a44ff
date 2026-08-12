import type { Ausleihe, Werkzeuge, Handwerker } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { APP_IDS } from '@/types/app';
import { AttachmentsSection } from '@/components/AttachmentsSection';
import { Badge } from '@/components/ui/badge';
import { IconPencil } from '@tabler/icons-react';
import { t, appLabel, fieldLabel, lookupLabel, dateFnsLocale, dateFormat } from '@/i18n';
import { format, parseISO } from 'date-fns';

function formatDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), dateFormat(), { locale: dateFnsLocale() }); } catch { return d; }
}

interface AusleiheViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: Ausleihe | null;
  onEdit: (record: Ausleihe) => void;
  werkzeugeList: Werkzeuge[];
  handwerkerList: Handwerker[];
}

export function AusleiheViewDialog({ open, onClose, record, onEdit, werkzeugeList, handwerkerList }: AusleiheViewDialogProps) {
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
          <DialogTitle>{t('view_entity', { entity: appLabel('ausleihe') })}</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            {t('edit_button')}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('ausleihe', 'werkzeug')}</Label>
            <p className="text-sm">{getWerkzeugeDisplayName(record.fields.werkzeug)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('ausleihe', 'handwerker')}</Label>
            <p className="text-sm">{getHandwerkerDisplayName(record.fields.handwerker)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('ausleihe', 'ausleihdatum')}</Label>
            <p className="text-sm">{formatDate(record.fields.ausleihdatum)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('ausleihe', 'geplantes_rueckgabedatum')}</Label>
            <p className="text-sm">{formatDate(record.fields.geplantes_rueckgabedatum)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('ausleihe', 'tatsaechliches_rueckgabedatum')}</Label>
            <p className="text-sm">{formatDate(record.fields.tatsaechliches_rueckgabedatum)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('ausleihe', 'status_ausleihe')}</Label>
            <Badge variant="secondary">{lookupLabel('ausleihe', 'status_ausleihe', record.fields.status_ausleihe?.key) ?? record.fields.status_ausleihe?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('ausleihe', 'bemerkungen_ausleihe')}</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.bemerkungen_ausleihe ?? '—'}</p>
          </div>
          <div className="pt-2 border-t border-border">
            <AttachmentsSection appId={APP_IDS.AUSLEIHE} recordId={record.record_id} readOnly />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}