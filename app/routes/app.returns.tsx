import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSearchParams, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  BlockStack,
  Filters,
  ChoiceList,
  Pagination,
  EmptyState,
  InlineStack,
  useBreakpoints,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import { prisma } from "../db.server";
import { ReturnStatusBadge } from "../components/ReturnStatusBadge";
import { RETURN_STATUSES, RETURN_STATUS_LABELS } from "../types/returns";

const PAGE_SIZE = 20;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);

  const status = url.searchParams.get("status") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const page = parseInt(url.searchParams.get("page") || "1", 10);
  const skip = (page - 1) * PAGE_SIZE;

  const where: any = { shop };

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { shopifyOrderName: { contains: search } },
      { customerName: { contains: search } },
      { customerEmail: { contains: search } },
    ];
  }

  const [returns, totalCount] = await Promise.all([
    prisma.returnRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
      include: {
        lineItems: {
          include: { reason: true },
        },
      },
    }),
    prisma.returnRequest.count({ where }),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return json({
    returns,
    totalCount,
    currentPage: page,
    totalPages,
    hasNext: page < totalPages,
    hasPrevious: page > 1,
  });
};

export default function ReturnsListPage() {
  const { returns, totalCount, currentPage, totalPages, hasNext, hasPrevious } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { smUp } = useBreakpoints();

  const [searchValue, setSearchValue] = useState(
    searchParams.get("search") || ""
  );
  const [selectedStatus, setSelectedStatus] = useState<string[]>(
    searchParams.get("status") ? [searchParams.get("status")!] : []
  );

  const handleStatusChange = useCallback(
    (value: string[]) => {
      setSelectedStatus(value);
      const params = new URLSearchParams(searchParams);
      if (value.length > 0) {
        params.set("status", value[0]);
      } else {
        params.delete("status");
      }
      params.set("page", "1");
      setSearchParams(params);
    },
    [searchParams, setSearchParams]
  );

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearchValue(value);
    },
    []
  );

  const handleSearchClear = useCallback(() => {
    setSearchValue("");
    const params = new URLSearchParams(searchParams);
    params.delete("search");
    params.set("page", "1");
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleSearchSubmit = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    if (searchValue) {
      params.set("search", searchValue);
    } else {
      params.delete("search");
    }
    params.set("page", "1");
    setSearchParams(params);
  }, [searchValue, searchParams, setSearchParams]);

  const handlePageChange = useCallback(
    (direction: "next" | "previous") => {
      const params = new URLSearchParams(searchParams);
      const newPage =
        direction === "next" ? currentPage + 1 : currentPage - 1;
      params.set("page", String(newPage));
      setSearchParams(params);
    },
    [currentPage, searchParams, setSearchParams]
  );

  const handleClearAll = useCallback(() => {
    setSelectedStatus([]);
    setSearchValue("");
    setSearchParams(new URLSearchParams());
  }, [setSearchParams]);

  const statusOptions = Object.entries(RETURN_STATUS_LABELS).map(
    ([value, label]) => ({ value, label })
  );

  const filters = [
    {
      key: "status",
      label: "Status",
      filter: (
        <ChoiceList
          title="Status"
          titleHidden
          choices={statusOptions}
          selected={selectedStatus}
          onChange={handleStatusChange}
        />
      ),
      shortcut: true,
    },
  ];

  const appliedFilters = selectedStatus.length > 0
    ? [
        {
          key: "status",
          label: `Status: ${RETURN_STATUS_LABELS[selectedStatus[0] as keyof typeof RETURN_STATUS_LABELS] || selectedStatus[0]}`,
          onRemove: () => handleStatusChange([]),
        },
      ]
    : [];

  const resourceName = {
    singular: "return",
    plural: "returns",
  };

  const rowMarkup = returns.map((returnReq, index) => {
    const totalValue = returnReq.lineItems.reduce(
      (sum, item) => sum + item.pricePerItem * item.quantity, 0
    );
    const productNames = returnReq.lineItems.map(item => item.productTitle).join(", ");
    const reasons = [...new Set(returnReq.lineItems.map(item => item.reason?.label).filter(Boolean))].join(", ");

    return (
      <IndexTable.Row
        id={returnReq.id}
        key={returnReq.id}
        position={index}
        onClick={() => navigate(`/app/returns/${returnReq.id}`)}
      >
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text as="span" variant="bodyMd" fontWeight="bold">
              {returnReq.shopifyOrderName}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {new Date(returnReq.createdAt).toLocaleDateString()}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text as="span" variant="bodyMd">
              {returnReq.customerName}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {returnReq.customerEmail}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <BlockStack gap="050">
            <Text as="span" variant="bodySm">
              {productNames.length > 60 ? productNames.substring(0, 57) + "..." : productNames}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {returnReq.lineItems.length} item{returnReq.lineItems.length !== 1 ? "s" : ""} · {totalValue.toFixed(2)} {returnReq.currency}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" variant="bodySm">
            {reasons || "—"}
          </Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <ReturnStatusBadge status={returnReq.status} />
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title="Returns"
      subtitle={`${totalCount} total`}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <Filters
              queryValue={searchValue}
              queryPlaceholder="Search by order, customer name or email..."
              filters={filters}
              appliedFilters={appliedFilters}
              onQueryChange={handleSearchChange}
              onQueryClear={handleSearchClear}
              onClearAll={handleClearAll}
            />
            {returns.length === 0 ? (
              <EmptyState
                heading="No returns found"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  {selectedStatus.length > 0 || searchValue
                    ? "Try changing your filters or search query."
                    : "When customers request returns, they will appear here."}
                </p>
              </EmptyState>
            ) : (
              <>
                <IndexTable
                  resourceName={resourceName}
                  itemCount={returns.length}
                  headings={[
                    { title: "Order / Date" },
                    { title: "Customer" },
                    { title: "Products / Value" },
                    { title: "Reason" },
                    { title: "Status" },
                  ]}
                  selectable={false}
                >
                  {rowMarkup}
                </IndexTable>
                {totalPages > 1 && (
                  <div style={{ padding: "16px", display: "flex", justifyContent: "center" }}>
                    <Pagination
                      hasPrevious={hasPrevious}
                      hasNext={hasNext}
                      onPrevious={() => handlePageChange("previous")}
                      onNext={() => handlePageChange("next")}
                    />
                  </div>
                )}
              </>
            )}
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
