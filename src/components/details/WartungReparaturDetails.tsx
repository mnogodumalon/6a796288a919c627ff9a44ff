import type { WartungReparatur, Werkzeuge, Handwerker } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { MediaThumbnail } from '@/components/widgets/MediaViewer';

export interface WartungReparaturDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: WartungReparatur;
  /** N:1-Ziel „Werkzeuge": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  werkzeugeList: Werkzeuge[];
  /** Klick auf die Werkzeuge-Relation → overlay.push auf dessen Detail. */
  onOpenWerkzeuge?: (record: Werkzeuge) => void;
  /** N:1-Ziel „Handwerker": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  handwerkerList: Handwerker[];
  /** Klick auf die Handwerker-Relation → overlay.push auf dessen Detail. */
  onOpenHandwerker?: (record: Handwerker) => void;
}

export function WartungReparaturDetails({
  record,
  werkzeugeList,
  onOpenWerkzeuge,
  handwerkerList,
  onOpenHandwerker,
}: WartungReparaturDetailsProps) {
  const werkzeug_wartungTarget = werkzeugeList.find(r => r.record_id === extractRecordId(record.fields.werkzeug_wartung));
  const verantwortlicherTarget = handwerkerList.find(r => r.record_id === extractRecordId(record.fields.verantwortlicher));
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('wartung_reparatur', 'vorgangsart')} value={record.fields.vorgangsart} format="pill" />
        <RecordField label={fieldLabel('wartung_reparatur', 'startdatum')} value={record.fields.startdatum} format="date" />
        <RecordField label={fieldLabel('wartung_reparatur', 'geplantes_enddatum')} value={record.fields.geplantes_enddatum} format="date" />
        <RecordField label={fieldLabel('wartung_reparatur', 'tatsaechliches_enddatum')} value={record.fields.tatsaechliches_enddatum} format="date" />
        <RecordField label={fieldLabel('wartung_reparatur', 'beschreibung')} value={record.fields.beschreibung} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('wartung_reparatur', 'status_wartung')} value={record.fields.status_wartung} format="pill" />
        <RecordField label={fieldLabel('wartung_reparatur', 'kosten')} value={record.fields.kosten} format="text" />
        <RecordField label={fieldLabel('wartung_reparatur', 'bemerkungen_wartung')} value={record.fields.bemerkungen_wartung} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('wartung_reparatur', 'dokument')} className="md:col-span-2">
          {record.fields.dokument ? (
            <MediaThumbnail src={record.fields.dokument as string} fit="contain" className="max-h-64 w-full rounded-lg" />
          ) : '—'}
        </RecordField>
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={2}>
        <RecordRelation
          label={fieldLabel('wartung_reparatur', 'werkzeug_wartung')}
          name={werkzeug_wartungTarget?.fields.werkzeugname ?? '—'}
          meta={[werkzeug_wartungTarget?.fields.inventarnummer, werkzeug_wartungTarget?.fields.hersteller].filter(Boolean).join(' · ') || undefined}
          onClick={werkzeug_wartungTarget && onOpenWerkzeuge ? () => onOpenWerkzeuge!(werkzeug_wartungTarget!) : undefined}
        />
        <RecordRelation
          label={fieldLabel('wartung_reparatur', 'verantwortlicher')}
          name={verantwortlicherTarget?.fields.vorname ?? '—'}
          meta={[verantwortlicherTarget?.fields.telefon, verantwortlicherTarget?.fields.email].filter(Boolean).join(' · ') || undefined}
          onClick={verantwortlicherTarget && onOpenHandwerker ? () => onOpenHandwerker!(verantwortlicherTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.WARTUNG_REPARATUR} recordId={record.record_id} />
    </>
  );
}
