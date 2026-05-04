-- =============================================================================
-- V1__init.sql  –  Initial schema for ContosoStore
--
-- Migrated from:  ContosoStore.Api  (EF Core / SQL Server)
-- Target RDBMS:   PostgreSQL 15
-- Flyway version: 1
--
-- Tables created (in dependency order)
--   1. products
--   2. orders
--   3. order_items
--
-- Design notes
--   • All primary keys use BIGSERIAL (PostgreSQL equivalent of IDENTITY(1,1)).
--   • Monetary columns use NUMERIC(p,s) instead of SQL Server's DECIMAL for
--     portable precision semantics.
--   • Timestamps are stored as TIMESTAMPTZ (with time zone) so the database
--     always holds UTC values, matching the Java Instant → JDBC mapping.
--   • OrderStatus is constrained via CHECK rather than a PostgreSQL ENUM so
--     that adding a new status value is a cheap ALTER TABLE, not a DDL type change.
--   • Foreign-key indexes are added explicitly; PostgreSQL does not create them
--     automatically (unlike SQL Server).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. products
--    Mirrors com.example.outputfolder.domain.Product
-- ---------------------------------------------------------------------------
CREATE TABLE products (
    id             BIGSERIAL                NOT NULL,
    name           VARCHAR(120)             NOT NULL,
    description    VARCHAR(2000),
    price          NUMERIC(10, 2)           NOT NULL,
    stock_quantity INTEGER                  NOT NULL DEFAULT 0,
    category       VARCHAR(60)              NOT NULL DEFAULT 'GENERAL',
    created_at     TIMESTAMPTZ              NOT NULL,
    updated_at     TIMESTAMPTZ,
    is_active      BOOLEAN                  NOT NULL DEFAULT TRUE,

    CONSTRAINT pk_products           PRIMARY KEY (id),
    CONSTRAINT chk_products_price    CHECK (price     >= 0),
    CONSTRAINT chk_products_stock    CHECK (stock_quantity >= 0)
);

COMMENT ON TABLE  products               IS 'Product catalogue. soft-delete via is_active flag.';
COMMENT ON COLUMN products.name          IS 'Display name – max 120 chars (legacy [StringLength(120)]).';
COMMENT ON COLUMN products.price         IS 'Unit price; NUMERIC(10,2) mirrors legacy EF HasPrecision(10,2).';
COMMENT ON COLUMN products.stock_quantity IS 'Available inventory units.';
COMMENT ON COLUMN products.category      IS 'Product category; defaults to GENERAL (legacy default).';
COMMENT ON COLUMN products.created_at    IS 'UTC timestamp set by @PrePersist on first save.';
COMMENT ON COLUMN products.updated_at    IS 'UTC timestamp set by @PreUpdate; NULL until first update.';
COMMENT ON COLUMN products.is_active     IS 'Soft-delete flag – FALSE hides product from queries.';

-- Index to support category-filtered listing (GET /api/products?category=...)
CREATE INDEX idx_products_category  ON products (category);
-- Index to speed up active-product queries
CREATE INDEX idx_products_is_active ON products (is_active);

-- ---------------------------------------------------------------------------
-- 2. orders
--    Mirrors com.example.outputfolder.domain.Order
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
    id             BIGSERIAL                NOT NULL,
    customer_email VARCHAR(254)             NOT NULL,
    placed_at      TIMESTAMPTZ              NOT NULL,
    status         VARCHAR(20)              NOT NULL DEFAULT 'PENDING',
    total_amount   NUMERIC(12, 2)           NOT NULL DEFAULT 0.00,

    CONSTRAINT pk_orders             PRIMARY KEY (id),
    CONSTRAINT chk_orders_status     CHECK (status IN (
                                         'PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED'
                                     )),
    CONSTRAINT chk_orders_total      CHECK (total_amount >= 0)
);

COMMENT ON TABLE  orders                IS 'Customer orders.';
COMMENT ON COLUMN orders.customer_email IS 'RFC 5321 max 254 chars; references user by e-mail (no FK to users table).';
COMMENT ON COLUMN orders.placed_at      IS 'UTC timestamp set by @PrePersist.';
COMMENT ON COLUMN orders.status         IS 'Lifecycle status stored as VARCHAR (mirrors @Enumerated(EnumType.STRING)).';
COMMENT ON COLUMN orders.total_amount   IS 'Sum of (unit_price × quantity) across all order_items; NUMERIC(12,2).';

-- Index to support GET /api/orders/customer/{email}
CREATE INDEX idx_orders_customer_email ON orders (customer_email);
-- Index to support status-based lookups (e.g. fulfilment dashboard)
CREATE INDEX idx_orders_status         ON orders (status);

-- ---------------------------------------------------------------------------
-- 3. order_items
--    Mirrors com.example.outputfolder.domain.OrderItem
-- ---------------------------------------------------------------------------
CREATE TABLE order_items (
    id         BIGSERIAL      NOT NULL,
    order_id   BIGINT         NOT NULL,
    product_id BIGINT         NOT NULL,
    quantity   INTEGER        NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL,

    CONSTRAINT pk_order_items          PRIMARY KEY (id),
    CONSTRAINT fk_order_items_order    FOREIGN KEY (order_id)
                                           REFERENCES orders (id)
                                           ON DELETE CASCADE,
    CONSTRAINT fk_order_items_product  FOREIGN KEY (product_id)
                                           REFERENCES products (id),
    CONSTRAINT chk_order_items_qty     CHECK (quantity   >= 1),
    CONSTRAINT chk_order_items_price   CHECK (unit_price >= 0)
);

COMMENT ON TABLE  order_items            IS 'Individual line items within an order.';
COMMENT ON COLUMN order_items.order_id   IS 'FK → orders.id; CASCADE DELETE mirrors orphanRemoval=true.';
COMMENT ON COLUMN order_items.product_id IS 'FK → products.id; price is captured at order time, no cascade.';
COMMENT ON COLUMN order_items.quantity   IS 'Units ordered; must be ≥ 1.';
COMMENT ON COLUMN order_items.unit_price IS 'Price snapshotted at order placement – immune to future price changes.';

-- FK indexes (PostgreSQL does not auto-create these)
CREATE INDEX idx_order_items_order_id   ON order_items (order_id);
CREATE INDEX idx_order_items_product_id ON order_items (product_id);
