import type { Handwerker, Ausleihe, WartungReparatur } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface HandwerkerDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Handwerker;
  /** 1:N „Ausleihe": VOLLE Liste — der Block filtert auf diesen Record. */
  ausleiheList: Ausleihe[];
  /** Zeilen-Klick → overlay.push auf das Ausleihe-Detail (nie der Edit-Dialog). */
  onOpenAusleihe: (record: Ausleihe) => void;
  /** Kontextuelles „+": öffnet den Ausleihe-Dialog mit diesem Record vorgesetzt. */
  onAddAusleihe: () => void;
  /** 1:N „Wartung & Reparatur": VOLLE Liste — der Block filtert auf diesen Record. */
  wartungReparaturList: WartungReparatur[];
  /** Zeilen-Klick → overlay.push auf das WartungReparatur-Detail (nie der Edit-Dialog). */
  onOpenWartungReparatur: (record: WartungReparatur) => void;
  /** Kontextuelles „+": öffnet den WartungReparatur-Dialog mit diesem Record vorgesetzt. */
  onAddWartungReparatur: () => void;
}

export function HandwerkerDetails({
  record,
  ausleiheList,
  onOpenAusleihe,
  onAddAusleihe,
  wartungReparaturList,
  onOpenWartungReparatur,
  onAddWartungReparatur,
}: HandwerkerDetailsProps) {
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('handwerker', 'vorname')} value={record.fields.vorname} format="text" />
        <RecordField label={fieldLabel('handwerker', 'nachname')} value={record.fields.nachname} format="text" />
        <RecordField label={fieldLabel('handwerker', 'personalnummer')} value={record.fields.personalnummer} format="text" />
        <RecordField label={fieldLabel('handwerker', 'telefon')} value={record.fields.telefon} format="text" />
        <RecordField label={fieldLabel('handwerker', 'email')} value={record.fields.email} format="email" />
        <RecordField label={fieldLabel('handwerker', 'abteilung')} value={record.fields.abteilung} format="text" />
        <RecordField label={fieldLabel('handwerker', 'qualifikation')} value={record.fields.qualifikation} format="pill" />
        <RecordField label={fieldLabel('handwerker', 'status')} value={record.fields.status} format="pill" />
        <RecordField label={fieldLabel('handwerker', 'bemerkungen')} value={record.fields.bemerkungen} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <SatelliteSection
        title={appLabel('ausleihe')}
        items={ausleiheList.filter(r => extractRecordId(r.fields.handwerker) === record.record_id)}
        map={r => ({ name: appLabel('ausleihe'), meta: r.fields.ausleihdatum })}
        onOpen={onOpenAusleihe}
        onAdd={onAddAusleihe}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title={appLabel('wartung_reparatur')}
        items={wartungReparaturList.filter(r => extractRecordId(r.fields.verantwortlicher) === record.record_id)}
        map={r => ({ name: appLabel('wartung_reparatur'), meta: r.fields.startdatum })}
        onOpen={onOpenWartungReparatur}
        onAdd={onAddWartungReparatur}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.HANDWERKER} recordId={record.record_id} />
    </>
  );
}
