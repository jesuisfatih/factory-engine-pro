import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Search, Grid3x3, List as ListIcon, ShoppingCart, X,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/QueryState';
import { apiErrorMessage } from '@/lib/api';
import { addCartItem, createCart, fetchActiveCart, fetchBuyerProducts, uniqueVendors, type BuyerProduct } from '@/lib/portal';

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
  const queryClient = useQueryClient();
  const { data: products = [], isLoading, isError, error, refetch } = useQuery({ queryKey: QK, queryFn: fetchBuyerProducts });
  const addToCart = useMutation({
    mutationFn: async (product: BuyerProduct) => {
      const cart = (await fetchActiveCart()) ?? (await createCart({ reason: 'Catalog add to cart' }));
      return addCartItem(cart.id, {
        ...(product.variantId ? { catalogVariantId: product.variantId } : { sku: product.sku }),
        quantity: 1,
      });
    },
    onSuccess: async () => {
      toast.success('Added to cart');
      await queryClient.invalidateQueries({ queryKey: ['active-cart'] });
    },
    onError: (error) => toast.error('Could not add item', { description: apiErrorMessage(error) }),
  });

  const [search, setSearch] = useState('');
  const [vendor, setVendor] = useState('');
  const [discountedOnly, setDiscountedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('default');
  const [view, setView] = useState<ViewMode>('grid');

  const vendors = useMemo(() => uniqueVendors(products), [products]);

  const filtered = useMemo(() => {
    const text = search.toLowerCase().trim();
    let list = products.slice();
    if (text) list = list.filter((product) => `${product.name} ${product.sku} ${product.vendor}`.toLowerCase().includes(text));
    if (vendor) list = list.filter((product) => product.vendor === vendor);
    if (discountedOnly) list = list.filter((product) => discountPct(product) > 0);
    if (sort === 'price_asc') list.sort((a, b) => a.yourPriceUsd - b.yourPriceUsd);
    else if (sort === 'price_desc') list.sort((a, b) => b.yourPriceUsd - a.yourPriceUsd);
    else if (sort === 'discount') list.sort((a, b) => discountPct(b) - discountPct(a));
    return list;
  }, [products, search, vendor, discountedOnly, sort]);

  const onSale = products.filter((product) => discountPct(product) > 0).length;
  const avgDiscount = products.length > 0
    ? Math.round(products.reduce((sum, product) => sum + discountPct(product), 0) / products.length)
    : 0;
  const savings = products.reduce((sum, product) => sum + Math.max(0, product.listPriceUsd - product.yourPriceUsd), 0);

  const clearFilters = () => { setSearch(''); setVendor(''); setDiscountedOnly(false); setSort('default'); };
  const hasFilters = search || vendor || discountedOnly || sort !== 'default';

  return (
    <>
      <PageHeader titleI18nKey="products.title" subtitleI18nKey="products.subtitle" />

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 14 }}>
        <div className="kpi"><div className="label">{t('products.kpi_total')}</div><div className="val">{products.length}</div><div className="sub">in catalog</div></div>
        <div className="kpi"><div className="label">{t('products.kpi_on_sale')}</div><div className="val">{onSale}</div><div className="sub">discounted</div></div>
        <div className="kpi"><div className="label">{t('products.kpi_avg_discount')}</div><div className="val">{avgDiscount}%</div><div className="sub">off list</div></div>
        <div className="kpi"><div className="label">{t('products.kpi_savings')}</div><div className="val">{fmtMoney(savings)}</div><div className="sub">across catalog</div></div>
      </div>

      <div className="orders-toolbar" style={{ flexWrap: 'wrap' }}>
        <div className="orders-search" style={{ flex: 1, minWidth: 240 }}>
          <Search size={14} />
          <input placeholder={t('products.search_placeholder')} value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <select value={vendor} onChange={(event) => setVendor(event.target.value)}>
          <option value="">{t('products.filter_vendor_all')}</option>
          {vendors.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
          <option value="default">{t('products.sort_default')}</option>
          <option value="price_asc">{t('products.sort_price_asc')}</option>
          <option value="price_desc">{t('products.sort_price_desc')}</option>
          <option value="discount">{t('products.sort_discount')}</option>
        </select>
        <label className="checkbox-row" style={{ marginBottom: 0 }}>
          <input type="checkbox" checked={discountedOnly} onChange={(event) => setDiscountedOnly(event.target.checked)} />
          {t('products.filter_discounted_only')}
        </label>
        <div className="tabs" role="tablist" style={{ marginLeft: 'auto' }}>
          <button type="button" className={`tab${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')}>
            <Grid3x3 size={12} /> {t('products.view_grid')}
          </button>
          <button type="button" className={`tab${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')}>
            <ListIcon size={12} /> {t('products.view_list')}
          </button>
        </div>
        {hasFilters && (
          <button type="button" className="btn ghost" onClick={clearFilters}>
            <X size={13} /> {t('products.clear_filters')}
          </button>
        )}
      </div>

      {isError ? (
        <ErrorState title="Could not load catalog" error={error} retry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <div className="section" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 32, marginTop: 14 }}>
          {isLoading ? t('common.loading') : t('products.empty_state')}
        </div>
      ) : view === 'grid' ? (
        <div className="catalog-grid">
          {filtered.map((product) => {
            const discount = discountPct(product);
            return (
              <article key={product.id} className="catalog-card">
                <div className="catalog-thumb" style={{ background: `linear-gradient(135deg, ${product.imageBg}, var(--surface-3))` }}>
                  {discount > 0 && (
                    <span className="catalog-discount">{t('products.discount_off', { percent: discount })}</span>
                  )}
                  <span className="catalog-vendor">{product.vendor}</span>
                </div>
                <div className="catalog-body">
                  <div className="name">{product.name}</div>
                  <div className="muted" style={{ fontSize: 11 }}>SKU {product.sku}</div>
                  <div className="catalog-price-row">
                    {discount > 0 && <span className="catalog-list-price">{fmtMoney(product.listPriceUsd)}</span>}
                    <strong>{fmtMoney(product.yourPriceUsd)}</strong>
                  </div>
                  {product.pricingLabel ? <div className="muted" style={{ fontSize: 11 }}>{product.pricingLabel}</div> : null}
                  <div className="catalog-actions">
                    <span className={`pill ${product.inStock ? 'success' : 'danger'}`}>
                      {product.inStock ? t('products.in_stock') : t('products.out_of_stock')}
                    </span>
                    <button
                      type="button"
                      className="btn"
                      disabled={!product.inStock || addToCart.isPending}
                      title={product.inStock ? 'Add this catalog item to your review cart' : 'This item is out of stock'}
                      onClick={() => addToCart.mutate(product)}
                    >
                      <ShoppingCart size={12} /> {t('products.add_to_cart')}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="data-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Vendor</th>
                <th>{t('products.list_price')}</th>
                <th>{t('products.your_price')}</th>
                <th>Discount</th>
                <th>Stock</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((product) => {
                const discount = discountPct(product);
                return (
                  <tr key={product.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="catalog-list-thumb" style={{ background: `linear-gradient(135deg, ${product.imageBg}, var(--surface-3))` }} />
                        <div>
                          <strong>{product.name}</strong>
                          <div className="muted" style={{ fontSize: 11 }}>SKU {product.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td className="muted">{product.vendor}</td>
                    <td>{fmtMoney(product.listPriceUsd)}</td>
                    <td><strong>{fmtMoney(product.yourPriceUsd)}</strong>{product.pricingLabel ? <div className="muted" style={{ fontSize: 11 }}>{product.pricingLabel}</div> : null}</td>
                    <td>
                      {discount > 0
                        ? <span className="pill success">{t('products.discount_off', { percent: discount })}</span>
                        : <span className="muted">-</span>}
                    </td>
                    <td>
                      <span className={`pill ${product.inStock ? 'success' : 'danger'}`}>
                        {product.inStock ? t('products.in_stock') : t('products.out_of_stock')}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn"
                        disabled={!product.inStock || addToCart.isPending}
                        title={product.inStock ? 'Add this catalog item to your review cart' : 'This item is out of stock'}
                        onClick={() => addToCart.mutate(product)}
                      >
                        <ShoppingCart size={12} /> {t('products.add_to_cart')}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export const Route = createFileRoute('/products')({ component: ProductsView });
