import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Download, FileText, FileImage, FileType2 } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { fetchDocuments, type DocumentCategory } from '@/lib/mock';

const QK = ['documents'] as const;

const TABS: ('all' | DocumentCategory)[] = ['all', 'contract', 'certificate', 'tax', 'license', 'other'];
const TAB_LABEL: Record<typeof TABS[number], string> = {
  all: 'documents.tab_all',
  contract: 'documents.tab_contracts',
  certificate: 'documents.tab_certificates',
  tax: 'documents.tab_tax',
  license: 'documents.tab_licenses',
  other: 'documents.tab_other',
};

const CATEGORY_TONE: Record<DocumentCategory, string> = {
  contract: 'accent', certificate: 'info', tax: 'warn', license: 'success', other: '',
};

function iconFor(mime: string) {
  if (mime.startsWith('image/')) return FileImage;
  if (mime === 'application/msword') return FileType2;
  return FileText;
}

function fmtSize(bytes: number) {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function DocumentsView() {
  const { t } = useTranslation();
  const { data: documents = [], isLoading } = useQuery({ queryKey: QK, queryFn: fetchDocuments });
  const [tab, setTab] = useState<typeof TABS[number]>('all');

  const filtered = useMemo(() => tab === 'all' ? documents : documents.filter((doc) => doc.category === tab), [documents, tab]);

  return (
    <>
      <PageHeader
        titleI18nKey="documents.title"
        subtitleI18nKey="documents.subtitle"
        actions={(
          <button type="button" className="btn primary">
            <Upload size={14} /> {t('documents.upload')}
          </button>
        )}
      />

      <div className="tabs" role="tablist" style={{ marginBottom: 14 }}>
        {TABS.map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            className={`tab${tab === value ? ' active' : ''}`}
            onClick={() => setTab(value)}
          >
            {t(TAB_LABEL[value])}
          </button>
        ))}
      </div>

      <div className="documents-dropzone">
        <Upload size={16} />
        <span>{t('documents.drag_drop_hint')}</span>
      </div>

      <div className="data-card" style={{ marginTop: 14 }}>
        <table className="data-table" id="table-documents">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Size</th>
              <th>Uploaded</th>
              <th>By</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                {isLoading ? t('common.loading') : t('documents.empty_state')}
              </td></tr>
            ) : filtered.map((doc) => {
              const Icon = iconFor(doc.mimeType);
              return (
                <tr key={doc.id} id={`row-doc-${doc.id}`}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="doc-icon"><Icon size={14} /></span>
                      <strong>{doc.name}</strong>
                    </div>
                  </td>
                  <td><span className={`pill ${CATEGORY_TONE[doc.category]}`}>{t(`documents.categories.${doc.category}`)}</span></td>
                  <td className="muted">{fmtSize(doc.sizeBytes)}</td>
                  <td className="muted">{doc.uploadedAt}</td>
                  <td className="muted">{doc.uploadedBy}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button type="button" className="btn ghost" title={t('documents.download')}>
                      <Download size={12} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export const Route = createFileRoute('/documents')({ component: DocumentsView });
