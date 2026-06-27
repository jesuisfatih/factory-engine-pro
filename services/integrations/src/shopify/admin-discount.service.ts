export interface ShopifyAdminCredentials {
  shopDomain: string;
  adminAccessToken: string;
  apiVersion?: string;
}

export interface ShopifyDiscountCodeInput {
  title: string;
  code: string;
  startsAt: string;
  endsAt?: string | null;
  percentage?: number;
  amount?: number;
  currencyCode?: string;
  customerGets?: Record<string, unknown>;
  customerSelection?: Record<string, unknown>;
}

export interface ShopifyAppDiscountInput {
  title: string;
  code: string;
  startsAt: string;
  endsAt?: string | null;
  functionId: string;
  metafields?: Array<Record<string, unknown>>;
}

export class ShopifyAdminDiscountService {
  async fetchDiscountCatalog(credentials: ShopifyAdminCredentials) {
    const query = `#graphql
      query FactoryDiscountCatalog {
        codeDiscountNodes(first: 50, reverse: true) {
          edges {
            node {
              id
              codeDiscount {
                __typename
                ... on DiscountCodeBasic {
                  title
                  status
                  startsAt
                  endsAt
                  codes(first: 1) { nodes { code } }
                }
                ... on DiscountCodeApp {
                  title
                  status
                  startsAt
                  endsAt
                  codes(first: 1) { nodes { code } }
                }
              }
            }
          }
        }
        automaticDiscountNodes(first: 50, reverse: true) {
          edges {
            node {
              id
              automaticDiscount {
                __typename
                ... on DiscountAutomaticBasic {
                  title
                  status
                  startsAt
                  endsAt
                }
              }
            }
          }
        }
      }
    `;
    const data = await this.graphql<{
      codeDiscountNodes: { edges: Array<{ node: Record<string, unknown> }> };
      automaticDiscountNodes: { edges: Array<{ node: Record<string, unknown> }> };
    }>(credentials, query);
    return {
      codeDiscounts: data.codeDiscountNodes.edges.map((edge) => edge.node),
      automaticDiscounts: data.automaticDiscountNodes.edges.map((edge) => edge.node),
    };
  }

  async createDiscountCode(credentials: ShopifyAdminCredentials, input: ShopifyDiscountCodeInput) {
    const mutation = `#graphql
      mutation FactoryDiscountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            id
            codeDiscount {
              __typename
              ... on DiscountCodeBasic {
                title
                status
                codes(first: 1) { nodes { code } }
              }
            }
          }
          userErrors { field message code }
        }
      }
    `;
    const variables = {
      basicCodeDiscount: {
        title: input.title,
        code: input.code,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        customerSelection: input.customerSelection ?? { all: true },
        customerGets: input.customerGets ?? this.customerGets(input),
        combinesWith: {
          orderDiscounts: true,
          productDiscounts: true,
          shippingDiscounts: false,
        },
        usageLimit: null,
        appliesOncePerCustomer: false,
      },
    };
    const result = await this.graphql<{
      discountCodeBasicCreate: {
        codeDiscountNode: { id: string } | null;
        userErrors: Array<{ field?: string[]; message: string; code?: string }>;
      };
    }>(credentials, mutation, variables);
    const payload = result.discountCodeBasicCreate;
    if (payload.userErrors.length > 0) {
      throw new Error(payload.userErrors.map((error) => error.message).join('; '));
    }
    return payload.codeDiscountNode;
  }

  async createAppDiscountCode(credentials: ShopifyAdminCredentials, input: ShopifyAppDiscountInput) {
    const mutation = `#graphql
      mutation FactoryDiscountCodeAppCreate($codeAppDiscount: DiscountCodeAppInput!) {
        discountCodeAppCreate(codeAppDiscount: $codeAppDiscount) {
          codeAppDiscount { discountId }
          userErrors { field message code }
        }
      }
    `;
    const result = await this.graphql<{
      discountCodeAppCreate: {
        codeAppDiscount: { discountId: string } | null;
        userErrors: Array<{ field?: string[]; message: string; code?: string }>;
      };
    }>(credentials, mutation, {
      codeAppDiscount: {
        title: input.title,
        code: input.code,
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        functionId: input.functionId,
        combinesWith: {
          orderDiscounts: true,
          productDiscounts: true,
          shippingDiscounts: false,
        },
        metafields: input.metafields ?? [],
      },
    });
    const payload = result.discountCodeAppCreate;
    if (payload.userErrors.length > 0) {
      throw new Error(payload.userErrors.map((error) => error.message).join('; '));
    }
    return payload.codeAppDiscount;
  }

  async deleteDiscountCode(credentials: ShopifyAdminCredentials, discountId: string) {
    const mutation = `#graphql
      mutation FactoryDiscountCodeDelete($id: ID!) {
        discountCodeDelete(id: $id) {
          deletedCodeDiscountId
          userErrors { field message code }
        }
      }
    `;
    const result = await this.graphql<{
      discountCodeDelete: {
        deletedCodeDiscountId: string | null;
        userErrors: Array<{ field?: string[]; message: string; code?: string }>;
      };
    }>(credentials, mutation, { id: discountId });
    const payload = result.discountCodeDelete;
    if (payload.userErrors.length > 0) {
      throw new Error(payload.userErrors.map((error) => error.message).join('; '));
    }
    return payload.deletedCodeDiscountId;
  }

  private customerGets(input: ShopifyDiscountCodeInput) {
    if (input.percentage !== undefined) {
      return {
        value: { percentage: input.percentage / 100 },
        items: { all: true },
      };
    }
    return {
      value: {
        discountAmount: {
          amount: input.amount ?? 0,
          appliesOnEachItem: false,
        },
      },
      items: { all: true },
    };
  }

  private async graphql<T>(
    credentials: ShopifyAdminCredentials,
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const response = await fetch(this.endpoint(credentials), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-shopify-access-token': credentials.adminAccessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
    const payload = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
    if (!response.ok) {
      throw new Error(`Shopify Admin API failed with ${response.status}`);
    }
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((error) => error.message).join('; '));
    }
    if (!payload.data) {
      throw new Error('Shopify Admin API returned no data');
    }
    return payload.data;
  }

  private endpoint(credentials: ShopifyAdminCredentials) {
    const domain = credentials.shopDomain
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '');
    return `https://${domain}/admin/api/${credentials.apiVersion ?? '2026-01'}/graphql.json`;
  }
}
