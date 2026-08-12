import type { Werkzeuge } from '@/types/app';
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

interface WerkzeugeViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: Werkzeuge | null;
  onEdit: (record: Werkzeuge) => void;
}

export function WerkzeugeViewDialog({ open, onClose, record, onEdit }: WerkzeugeViewDialogProps) {
  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('view_entity', { entity: appLabel('werkzeuge') })}</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            {t('edit_button')}
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('werkzeuge', 'werkzeugname')}</Label>
            <p className="text-sm">{record.fields.werkzeugname ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('werkzeuge', 'inventarnummer')}</Label>
            <p className="text-sm">{record.fields.inventarnummer ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('werkzeuge', 'kategorie')}</Label>
            <Badge variant="secondary">{lookupLabel('werkzeuge', 'kategorie', record.fields.kategorie?.key) ?? record.fields.kategorie?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('werkzeuge', 'hersteller')}</Label>
            <p className="text-sm">{record.fields.hersteller ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('werkzeuge', 'modell')}</Label>
            <p className="text-sm">{record.fields.modell ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('werkzeuge', 'seriennummer')}</Label>
            <p className="text-sm">{record.fields.seriennummer ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('werkzeuge', 'anschaffungsdatum')}</Label>
            <p className="text-sm">{formatDate(record.fields.anschaffungsdatum)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('werkzeuge', 'standort')}</Label>
            <p className="text-sm">{record.fields.standort ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('werkzeuge', 'zustand')}</Label>
            <Badge variant="secondary">{lookupLabel('werkzeuge', 'zustand', record.fields.zustand?.key) ?? record.fields.zustand?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('werkzeuge', 'foto')}</Label>
            {record.fields.foto ? (
              <MediaThumbnail src={record.fields.foto} fit="contain" className="w-full rounded-lg border" />
            ) : <p className="text-sm text-muted-foreground">—</p>}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{fieldLabel('werkzeuge', 'bemerkungen_werkzeug')}</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.bemerkungen_werkzeug ?? '—'}</p>
          </div>
          <div className="pt-2 border-t border-border">
            <AttachmentsSection appId={APP_IDS.WERKZEUGE} recordId={record.record_id} readOnly />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}