import type { Werkzeuge, Ausleihe, WartungReparatur } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
import { MediaThumbnail } from '@/components/widgets/MediaViewer';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface WerkzeugeDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Werkzeuge;
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

export function WerkzeugeDetails({
  record,
  ausleiheList,
  onOpenAusleihe,
  onAddAusleihe,
  wartungReparaturList,
  onOpenWartungReparatur,
  onAddWartungReparatur,
}: WerkzeugeDetailsProps) {
  return (
    <>
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('werkzeuge', 'werkzeugname')} value={record.fields.werkzeugname} format="text" />
        <RecordField label={fieldLabel('werkzeuge', 'inventarnummer')} value={record.fields.inventarnummer} format="text" />
        <RecordField label={fieldLabel('werkzeuge', 'kategorie')} value={record.fields.kategorie} format="pill" />
        <RecordField label={fieldLabel('werkzeuge', 'hersteller')} value={record.fields.hersteller} format="text" />
        <RecordField label={fieldLabel('werkzeuge', 'modell')} value={record.fields.modell} format="text" />
        <RecordField label={fieldLabel('werkzeuge', 'seriennummer')} value={record.fields.seriennummer} format="text" />
        <RecordField label={fieldLabel('werkzeuge', 'anschaffungsdatum')} value={record.fields.anschaffungsdatum} format="date" />
        <RecordField label={fieldLabel('werkzeuge', 'standort')} value={record.fields.standort} format="text" />
        <RecordField label={fieldLabel('werkzeuge', 'zustand')} value={record.fields.zustand} format="pill" />
        <RecordField label={fieldLabel('werkzeuge', 'foto')} className="md:col-span-2">
          {record.fields.foto ? (
            <MediaThumbnail src={record.fields.foto as string} fit="contain" className="max-h-64 w-full rounded-lg" />
          ) : '—'}
        </RecordField>
        <RecordField label={fieldLabel('werkzeuge', 'bemerkungen_werkzeug')} value={record.fields.bemerkungen_werkzeug} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <SatelliteSection
        title={appLabel('ausleihe')}
        items={ausleiheList.filter(r => extractRecordId(r.fields.werkzeug) === record.record_id)}
        map={r => ({ name: appLabel('ausleihe'), meta: r.fields.ausleihdatum })}
        onOpen={onOpenAusleihe}
        onAdd={onAddAusleihe}
        getKey={r => r.record_id}
      />

      <SatelliteSection
        title={appLabel('wartung_reparatur')}
        items={wartungReparaturList.filter(r => extractRecordId(r.fields.werkzeug_wartung) === record.record_id)}
        map={r => ({ name: appLabel('wartung_reparatur'), meta: r.fields.startdatum })}
        onOpen={onOpenWartungReparatur}
        onAdd={onAddWartungReparatur}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.WERKZEUGE} recordId={record.record_id} />
    </>
  );
}
