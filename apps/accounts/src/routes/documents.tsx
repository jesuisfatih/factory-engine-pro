import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink, FileImage, FileText, FileType2, Search } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/QueryState';
import { downloadDocument, fetchDocuments, type BuyerDocument, type DocumentCategory } from '@/lib/portal';

type TabKey = 'all' | DocumentCategory;

const TABS: TabKey[] = ['all', 'invoice', 'design', 'contract', 'certificate', 'tax', 'license', 'other'];
const TAB_LABEL: Record<TabKey, string> = {
  all: 'documents.tab_all',
  invoice: 'documents.tab_invoices',
  design: 'documents.tab_designs',
  contract: 'documents.tab_contracts',
  certificate: 'documents.tab_certificates',
  tax: 'documents.tab_tax',
  license: 'documents.tab_licenses',
  other: 'documents.tab_other',
};

const CATEGORY_TONE: Record<DocumentCategory, string> = {
  invoice: 'success',
  design: 'info',
  contract: 'accent',
  certificate: 'info',
  tax: 'warn',
  license: 'success',
  other: '',
};

function iconFor(mime: string, category: DocumentCategory) {
  if (category === 'design' || mime.startsWith('image/')) return FileImage;
  if (mime.includes('word')) return FileType2;
  return FileText;
}

function fmtSize(bytes: number | null) {
  if (bytes === null) return 'Stored link';
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

function DocumentsView() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabKey>('all');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(10);
  const [cursor, setCursor] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const query = { category: tab, search: search || undefined, limit, cursor: cursor ?? undefined };
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: ['documents', query], queryFn: () => fetchDocuments(query) });
  const page = data ?? { data: [], meta: { count: 0, pageCount: 0, limit, cursor: null, nextCursor: null } };
  const documents = page.data;
  const meta = page.meta;
  const total = meta.count;
  const currentOffset = Number(meta.cursor ?? 0) || 0;
  const visible = documents.length;

  return (
    <>
      <PageHeader titleI18nKey="documents.title" subtitleI18nKey="documents.subtitle" />

      <div className="kpi-grid four">
        <div className="kpi"><div className="label">Files</div><div className="val">{total}</div><div className="sub">matching records</div></div>
        <div className="kpi"><div className="label">Invoices</div><div className="val">{documents.filter((doc) => doc.category === 'invoice').length}</div><div className="sub">visible page</div></div>
        <div className="kpi"><div className="label">Designs</div><div className="val">{documents.filter((doc) => doc.category === 'design').length}</div><div className="sub">visible page</div></div>
        <div className="kpi"><div className="label">Account docs</div><div className="val">{documents.filter((doc) => doc.documentKind === 'account_file').length}</div><div className="sub">visible page</div></div>
      </div>

      <div className="data-card" style={{ marginTop: 14 }}>
        <div className="portal-list-controls">
          <div className="tabs" role="tablist" style={{ flex: 1 }}>
            {TABS.map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                className={`tab${tab === value ? ' active' : ''}`}
                onClick={() => {
                  setCursor(null);
                  setTab(value);
                }}
              >
                {t(TAB_LABEL[value])}
              </button>
            ))}
          </div>
          <label className="portal-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => {
                setCursor(null);
                setSearch(event.target.value);
              }}
              placeholder={t('documents.search_placeholder')}
            />
          </label>
          <label className="portal-page-size">
            Show
            <select
              value={limit}
              onChange={(event) => {
                setCursor(null);
                setLimit(Number(event.target.value));
              }}
            >
              {[10, 50, 100, 150].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <div className="portal-page-status">
            {total === 0 ? 'No matching files' : `${currentOffset + 1}-${currentOffset + visible} of ${total}`}
          </div>
        </div>

        <table className="data-table" id="table-documents">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Related to</th>
              <th>Added as</th>
              <th>Size</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isError ? (
              <tr><td colSpan={7}><ErrorState title="Could not load documents" error={error} retry={() => refetch()} /></td></tr>
            ) : documents.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32 }}>
                {isLoading ? t('common.loading') : t('documents.empty_state')}
              </td></tr>
            ) : documents.map((doc) => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                downloading={downloadingId === doc.id}
                onDownload={() => void handleDownload(doc)}
              />
            ))}
          </tbody>
        </table>

        {documents.length > 0 ? (
          <div className="portal-pagination">
            <button
              type="button"
              className="btn"
              disabled={currentOffset === 0 || isLoading}
              onClick={() => setCursor(String(Math.max(0, currentOffset - limit)))}
            >
              Previous
            </button>
            <span>{total === 0 ? 'Page 0' : `Page ${Math.floor(currentOffset / limit) + 1}`}</span>
            <button
              type="button"
              className="btn"
              disabled={!meta.nextCursor || isLoading}
              onClick={() => setCursor(meta.nextCursor)}
            >
              Next
            </button>
          </div>
        ) : null}
      </div>
    </>
  );

  async function handleDownload(doc: BuyerDocument) {
    setDownloadingId(doc.id);
    try {
      await downloadDocument(doc);
    } finally {
      setDownloadingId(null);
    }
  }
}

function DocumentRow({ doc, downloading, onDownload }: { doc: BuyerDocument; downloading: boolean; onDownload: () => void }) {
  const { t } = useTranslation();
  const Icon = iconFor(doc.mimeType, doc.category);
  const ActionIcon = doc.downloadMode === 'url' ? ExternalLink : Download;
  return (
    <tr id={`row-doc-${doc.id}`}>
      <td>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="doc-icon"><Icon size={14} /></span>
          <div>
            <strong>{doc.name}</strong>
            {doc.invoiceNumber ? <div className="muted">Invoice {doc.invoiceNumber}</div> : null}
            {doc.orderNumber ? <div className="muted">Order {doc.orderNumber}</div> : null}
          </div>
        </div>
      </td>
      <td><span className={`pill ${CATEGORY_TONE[doc.category]}`}>{t(`documents.categories.${doc.category}`)}</span></td>
      <td>{doc.relatedLabel ?? 'Account file'}</td>
      <td className="muted">{doc.addedAs}</td>
      <td className="muted">{fmtSize(doc.sizeBytes)}</td>
      <td className="muted">{doc.uploadedAt}</td>
      <td style={{ textAlign: 'right' }}>
        <button
          type="button"
          className="btn ghost"
          title={doc.downloadMode === 'url' ? 'Open file' : t('documents.download')}
          disabled={downloading}
          onClick={onDownload}
        >
          <ActionIcon size={12} /> {downloading ? '...' : null}
        </button>
      </td>
    </tr>
  );
}

export const Route = createFileRoute('/documents')({ component: DocumentsView });
