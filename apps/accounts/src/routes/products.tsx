import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Grid3x3, Layers3, List as ListIcon, Search, Sparkles, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/QueryState';
import { fetchBuyerProducts, uniqueVendors, type BuyerProduct, type BuyerProductCollection } from '@/lib/portal';

const QK = ['products'] as const;

type SortKey = 'default' | 'price_asc' | 'price_desc' | 'discount';
type ViewMode = 'grid' | 'list';

function fmtMoney(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function discountPct(product: BuyerProduct) {
  if (product.listPriceUsd <= product.yourPriceUsd) return 0;
  return Math.round(((product.listPriceUsd - product.yourPriceUsd) / product.listPriceUsd) * 100);
}

function ProductsView() {
  const { t } = useTranslation();
  const { data, isLoading, isError, error, refetch } = useQuery({ queryKey: QK, queryFn: fetchBuyerProducts });
  const [search, setSearch] = useState('');
  const [vendor, setVendor] = useState('');
  const [collectionId, setCollectionId] = useState('');
  const [discountedOnly, setDiscountedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('default');
  const [view, setView] = useState<ViewMode>('grid');

  const collections = data?.collections ?? [];
  const uniqueProducts = useMemo(() => {
    const byId = new Map<string, BuyerProduct>();
    for (const collection of collections) {
      for (const product of collection.products) byId.set(product.id, product);
    }
    return [...byId.values()];
  }, [collections]);
  const vendors = useMemo(() => uniqueVendors(uniqueProducts), [uniqueProducts]);

  const filteredCollections = useMemo(() => {
    const text = search.toLowerCase().trim();
    return collections
      .filter((collection) => !collectionId || collection.id === collectionId)
      .map((collection) => {
        const products = collection.products
          .filter((product) => !text || `${product.name} ${product.sku} ${product.vendor}`.toLowerCase().includes(text))
          .filter((product) => !vendor || product.vendor === vendor)
          .filter((product) => !discountedOnly || discountPct(product) > 0)
          .slice();
        if (sort === 'price_asc') products.sort((a, b) => a.yourPriceUsd - b.yourPriceUsd);
        else if (sort === 'price_desc') products.sort((a, b) => b.yourPriceUsd - a.yourPriceUsd);
        else if (sort === 'discount') products.sort((a, b) => discountPct(b) - discountPct(a));
        return { ...collection, products };
      })
      .filter((collection) => collection.products.length > 0);
  }, [collections, collectionId, discountedOnly, search, sort, vendor]);

  const onSale = uniqueProducts.filter((product) => discountPct(product) > 0).length;
  const inStock = uniqueProducts.filter((product) => product.inStock).length;
  const featured = collections.find((collection) => collection.featured) ?? null;
  const clearFilters = () => {
    setSearch('');
    setVendor('');
    setCollectionId('');
    setDiscountedOnly(false);
    setSort('default');
  };
  const hasFilters = Boolean(search || vendor || collectionId || discountedOnly || sort !== 'default');

  return (
    <>
      <PageHeader titleI18nKey="products.title" subtitleI18nKey="products.subtitle" />

      <section className="catalog-overview" aria-label="Catalog overview">
        <div className="catalog-overview-copy">
          <span className="catalog-overview-icon"><Layers3 size={20} /></span>
          <div>
            <span className="catalog-eyebrow">Shopify catalog</span>
            <h2>{featured ? `${featured.title} is featured` : 'Browse by collection'}</h2>
            <p>Explore current products here, then continue on the store for product options and purchasing.</p>
          </div>
        </div>
        <div className="catalog-overview-stats">
          <div><strong>{data?.productCount ?? uniqueProducts.length}</strong><span>Products</span></div>
          <div><strong>{collections.length}</strong><span>Collections</span></div>
          <div><strong>{inStock}</strong><span>Available</span></div>
          <div><strong>{onSale}</strong><span>Special pricing</span></div>
        </div>
      </section>

      <div className="orders-toolbar catalog-toolbar">
        <div className="orders-search">
          <Search size={14} />
          <input placeholder={t('products.search_placeholder')} value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select value={collectionId} onChange={(event) => setCollectionId(event.target.value)} aria-label="Collection">
          <option value="">All collections</option>
          {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.title}</option>)}
        </select>
        <select value={vendor} onChange={(event) => setVendor(event.target.value)}>
          <option value="">{t('products.filter_vendor_all')}</option>
          {vendors.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
          <option value="default">{t('products.sort_default')}</option>
          <option value="price_asc">{t('products.sort_price_asc')}</option>
          <option value="price_desc">{t('products.sort_price_desc')}</option>
          <option value="discount">{t('products.sort_discount')}</option>
        </select>
        <label className="checkbox-row catalog-discount-filter">
          <input type="checkbox" checked={discountedOnly} onChange={(event) => setDiscountedOnly(event.target.checked)} />
          {t('products.filter_discounted_only')}
        </label>
        <div className="tabs" role="tablist">
          <button type="button" className={`tab${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')}><Grid3x3 size={12} /> {t('products.view_grid')}</button>
          <button type="button" className={`tab${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}><ListIcon size={12} /> {t('products.view_list')}</button>
        </div>
        {hasFilters ? <button type="button" className="btn ghost" onClick={clearFilters}><X size={13} /> {t('products.clear_filters')}</button> : null}
      </div>

      {isError ? (
        <ErrorState title="Could not load catalog" error={error} retry={() => refetch()} />
      ) : isLoading ? (
        <div className="catalog-loading" role="status"><span className="catalog-loading-ring" /><div><strong>Loading product collections</strong><span>Organizing the latest Shopify catalog for your account.</span></div></div>
      ) : filteredCollections.length === 0 ? (
        <div className="section catalog-empty">{t('products.empty_state')}</div>
      ) : (
        <div className="catalog-collections">
          {filteredCollections.map((collection) => <CollectionSection key={collection.id} collection={collection} view={view} />)}
        </div>
      )}
    </>
  );
}

function CollectionSection({ collection, view }: { collection: BuyerProductCollection; view: ViewMode }) {
  return (
    <section className={`catalog-collection${collection.featured ? ' featured' : ''}`} id={`collection-${collection.id}`}>
      <header className="catalog-collection-header">
        <div>
          <span className="catalog-collection-kicker">{collection.featured ? <><Sparkles size={12} /> Featured collection</> : 'Collection'}</span>
          <h2>{collection.title}</h2>
        </div>
        <span className="catalog-collection-count">{collection.products.length} products</span>
      </header>
      {view === 'grid' ? (
        <div className="catalog-grid">{collection.products.map((product) => <ProductCard key={`${collection.id}-${product.id}`} product={product} />)}</div>
      ) : (
        <div className="data-card catalog-list-card">
          <table className="data-table">
            <thead><tr><th>Product</th><th>Vendor</th><th>Price</th><th>Availability</th><th /></tr></thead>
            <tbody>{collection.products.map((product) => <ProductRow key={`${collection.id}-${product.id}`} product={product} />)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ProductCard({ product }: { product: BuyerProduct }) {
  const discount = discountPct(product);
  return (
    <article className="catalog-card">
      <a className="catalog-thumb" href={product.storefrontUrl ?? undefined} target="_blank" rel="noreferrer" aria-label={`View ${product.name} in store`}>
        {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <span className="catalog-image-fallback" style={{ background: `linear-gradient(135deg, ${product.imageBg}, var(--surface-3))` }} />}
        <span className="catalog-vendor">{product.vendor}</span>
        {discount > 0 ? <span className="catalog-discount">{discount}% off</span> : null}
      </a>
      <div className="catalog-body">
        <div className="catalog-product-meta"><span>SKU {product.sku}</span><span className={`catalog-stock ${product.inStock ? 'available' : ''}`}>{product.inStock ? 'Available' : 'Unavailable'}</span></div>
        <h3>{product.name}</h3>
        <div className="catalog-price-row">
          <div>{discount > 0 ? <span className="catalog-list-price">{fmtMoney(product.listPriceUsd)}</span> : null}<strong>{fmtMoney(product.yourPriceUsd)}</strong></div>
          {product.pricingLabel ? <span className="catalog-price-label">{product.pricingLabel}</span> : null}
        </div>
        {product.storefrontUrl ? <a className="catalog-store-link" href={product.storefrontUrl} target="_blank" rel="noreferrer">View in Shopify store <ArrowUpRight size={14} /></a> : <span className="catalog-store-link disabled">Store link unavailable</span>}
      </div>
    </article>
  );
}

function ProductRow({ product }: { product: BuyerProduct }) {
  return (
    <tr>
      <td><div className="catalog-list-product">{product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : <span style={{ background: product.imageBg }} />}<div><strong>{product.name}</strong><small>SKU {product.sku}</small></div></div></td>
      <td className="muted">{product.vendor}</td>
      <td><strong>{fmtMoney(product.yourPriceUsd)}</strong>{product.pricingLabel ? <small className="catalog-row-label">{product.pricingLabel}</small> : null}</td>
      <td><span className={`pill ${product.inStock ? 'success' : 'danger'}`}>{product.inStock ? 'Available' : 'Unavailable'}</span></td>
      <td className="catalog-row-action">{product.storefrontUrl ? <a className="btn" href={product.storefrontUrl} target="_blank" rel="noreferrer">View product <ArrowUpRight size={12} /></a> : null}</td>
    </tr>
  );
}

export const Route = createFileRoute('/products')({ component: ProductsView });
