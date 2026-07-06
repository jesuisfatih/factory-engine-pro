import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Clock3, CreditCard, Minus, Plus, RefreshCw, ShoppingCart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState } from '@/components/QueryState';
import { apiErrorMessage } from '@/lib/api';
import {
  checkoutCart,
  createCart,
  fetchActiveCart,
  removeCartItem,
  updateCartItem,
  type BuyerCart,
  type BuyerCartCheckoutResult,
} from '@/lib/portal';

const QK = ['active-cart'] as const;

function fmtMoney(value: number, currency = 'USD') {
  return value.toLocaleString('en-US', { style: 'currency', currency, maximumFractionDigits: 2 });
}

function fmtDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function cartActionCopy(cart: BuyerCart) {
  if (cart.checkoutAction === 'checkout' && cart.checkoutUrl) {
    return {
      label: 'Checkout ready',
      body: 'A secure checkout link is ready. Continue only when the cart items look correct.',
      tone: 'success',
      cta: 'Proceed to checkout',
    } as const;
  }
  if (cart.checkoutAction === 'unavailable' || cart.status === 'unavailable') {
    return {
      label: 'Not ready',
      body: cart.checkoutError ?? 'No reorderable items are available in this cart.',
      tone: 'danger',
      cta: 'Checkout unavailable',
    } as const;
  }
  return {
    label: 'Account review needed',
    body: cart.checkoutError ?? 'Items are saved while availability and pricing are confirmed for your account.',
    tone: 'info',
    cta: 'Request account review',
  } as const;
}

function CartStatus({ cart }: { cart: BuyerCart }) {
  const copy = cartActionCopy(cart);
  return <div className={`portal-alert ${copy.tone}`}><strong>{copy.label}</strong><span>{copy.body}</span></div>;
}

function CheckoutNotice({ result }: { result: BuyerCartCheckoutResult | null }) {
  if (!result) return null;
  const tone = result.action === 'unavailable' ? 'danger' : result.action === 'checkout' ? 'success' : 'info';
  return (
    <div className={`portal-alert ${tone}`}>
      <strong>{result.action === 'checkout' ? 'Checkout ready' : result.action === 'account_review' ? 'Account review requested' : result.action === 'review_cart' ? 'Account review cart saved' : 'Unavailable'}</strong>
      <span>{result.message}</span>
    </div>
  );
}

function CartView() {
  const queryClient = useQueryClient();
  const cartQuery = useQuery({ queryKey: QK, queryFn: fetchActiveCart });
  const cart = cartQuery.data ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: QK });
  const create = useMutation({
    mutationFn: () => createCart({ reason: 'Customer opened cart' }),
    onSuccess: () => { toast.success('Cart created'); refresh(); },
    onError: (error) => toast.error('Cart could not be created', { description: apiErrorMessage(error) }),
  });
  const updateQty = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) => updateCartItem(cart!.id, itemId, quantity),
    onSuccess: () => refresh(),
    onError: (error) => toast.error('Quantity update failed', { description: apiErrorMessage(error) }),
  });
  const remove = useMutation({
    mutationFn: (itemId: string) => removeCartItem(cart!.id, itemId),
    onSuccess: () => { toast.success('Item removed'); refresh(); },
    onError: (error) => toast.error('Remove failed', { description: apiErrorMessage(error) }),
  });
  const [checkoutResult, setCheckoutResult] = useMutationState();
  const checkout = useMutation({
    mutationFn: () => checkoutCart(cart!.id),
    onSuccess: (result) => {
      setCheckoutResult(result);
      refresh();
      if (result.checkoutUrl) window.location.assign(result.checkoutUrl);
    },
    onError: (error) => toast.error('Checkout request failed', { description: apiErrorMessage(error) }),
  });

  return (
    <>
      <PageHeader titleI18nKey="cart.title" subtitleI18nKey="cart.subtitle" />

      {cartQuery.isError ? (
        <ErrorState title="Could not load cart" error={cartQuery.error} retry={() => cartQuery.refetch()} />
      ) : cartQuery.isLoading ? (
        <div className="section" style={{ textAlign: 'center', padding: 32 }}>{'Loading...'}</div>
      ) : !cart ? (
        <div className="section" style={{ textAlign: 'center', padding: 32 }}>
          <ShoppingCart size={34} style={{ color: 'var(--accent)', marginBottom: 10 }} />
          <h3 style={{ margin: '0 0 6px' }}>Your reorder cart is empty</h3>
          <p className="muted" style={{ maxWidth: 520, margin: '0 auto 16px' }}>
            Reorder from an order or add catalog items. The cart stays in review until checkout is truly available.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <Link to="/orders" className="btn primary">Reorder from orders</Link>
            <Link to="/products" className="btn">Browse catalog</Link>
            <button type="button" className="btn ghost" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? <RefreshCw size={13} className="spin" /> : <ShoppingCart size={13} />}
              Create empty cart
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 14 }}>
            <div className="kpi"><div className="label">Items</div><div className="val">{cart.itemCount}</div><div className="sub">reorderable units</div></div>
            <div className="kpi"><div className="label">Subtotal</div><div className="val">{fmtMoney(cart.subtotalUsd, cart.currency)}</div><div className="sub">before shipping and tax</div></div>
            <div className="kpi">
              <div className="label">Status</div>
              <div className="val" style={{ fontSize: 16 }}>{cartActionCopy(cart).label}</div>
              <div className="sub">{cart.originOrderNumber ? `from ${cart.originOrderNumber}` : 'saved cart'}</div>
            </div>
          </div>

          <CheckoutNotice result={checkoutResult} />
          <CartStatus cart={cart} />

          <div className="cart-shell">
            <div className="data-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>SKU</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cart.items.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--text-muted)' }}>No items in this cart yet.</td></tr>
                  ) : cart.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.productTitle}</strong>
                        {item.variantTitle ? <div className="muted">{item.variantTitle}</div> : null}
                        {item.designFiles.length > 0 && <div className="muted">{item.designFiles.length} design file(s)</div>}
                      </td>
                      <td className="muted">{item.sku ?? '-'}</td>
                      <td>
                        <div className="qty-stepper">
                          <button type="button" disabled={updateQty.isPending || item.quantity <= 1} onClick={() => updateQty.mutate({ itemId: item.id, quantity: item.quantity - 1 })}><Minus size={12} /></button>
                          <span>{item.quantity}</span>
                          <button type="button" disabled={updateQty.isPending} onClick={() => updateQty.mutate({ itemId: item.id, quantity: item.quantity + 1 })}><Plus size={12} /></button>
                        </div>
                      </td>
                      <td>
                        {item.discountUsd > 0 && <div className="catalog-list-price">{fmtMoney(item.listPriceUsd, cart.currency)}</div>}
                        <strong>{fmtMoney(item.unitPriceUsd, cart.currency)}</strong>
                        {item.pricingLabel ? <div className="muted">{item.pricingLabel}</div> : null}
                      </td>
                      <td><strong>{fmtMoney(item.lineTotalUsd, cart.currency)}</strong></td>
                      <td><span className={`pill ${item.reorderable ? 'success' : 'danger'}`}>{item.reorderable ? 'Ready' : 'Review'}</span><div className="muted">{item.reason}</div></td>
                      <td style={{ textAlign: 'right' }}>
                        <button type="button" className="btn ghost" disabled={remove.isPending} onClick={() => remove.mutate(item.id)} title="Remove">
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <section className="reorder-detail cart-summary-panel" aria-label="Cart checkout review">
              <header>
                <div>
                  <h3>Cart summary</h3>
                  <div className="muted">Checkout is shown only when a real link exists.</div>
                </div>
              </header>
              <div className="reorder-total"><span>Subtotal</span><strong>{fmtMoney(cart.subtotalUsd, cart.currency)}</strong></div>
              <div className="reorder-total"><span>Total</span><strong>{fmtMoney(cart.totalUsd, cart.currency)}</strong></div>
              {cart.checkoutError ? <div className="portal-alert danger"><strong>Checkout blocked</strong><span>{cart.checkoutError}</span></div> : null}
              {cart.activities.length > 0 ? (
                <section className="cart-activity">
                  <h4>Cart timeline</h4>
                  <ol>
                    {cart.activities.map((activity) => (
                      <li key={activity.id}>
                        <span className="cart-activity-icon"><Clock3 size={12} /></span>
                        <div>
                          <strong>{activity.label}</strong>
                          {activity.detail ? <p>{activity.detail}</p> : null}
                          <time dateTime={activity.createdAt}>{fmtDateTime(activity.createdAt)}</time>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
              <div className="reorder-detail-actions">
                {cart.checkoutUrl ? (
                  <a className="save-btn" href={cart.checkoutUrl}>
                    <CreditCard size={13} /> {cartActionCopy(cart).cta}
                  </a>
                ) : (
                  <button
                    type="button"
                    className="save-btn"
                    disabled={cart.items.length === 0 || checkout.isPending || cart.checkoutAction === 'unavailable'}
                    onClick={() => checkout.mutate()}
                  >
                    <CreditCard size={13} /> {checkout.isPending ? 'Checking cart...' : cartActionCopy(cart).cta}
                  </button>
                )}
              </div>
              <Link to="/products" className="btn" style={{ justifyContent: 'center' }}>Add catalog items</Link>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function useMutationState() {
  return useState<BuyerCartCheckoutResult | null>(null);
}

export const Route = createFileRoute('/cart')({ component: CartView });
