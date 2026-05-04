package com.example.outputfolder.domain;

/**
 * Lifecycle states for an {@link Order}.
 *
 * <p>Mirrors the legacy C# enum:
 * <pre>{@code
 *   public enum OrderStatus { Pending, Paid, Shipped, Delivered, Cancelled }
 * }</pre>
 *
 * <p>Values are persisted as {@link String} via
 * {@code @Enumerated(EnumType.STRING)} on {@link Order#status},
 * which avoids brittle ordinal-based storage.
 */
public enum OrderStatus {

    /** Order has been placed but not yet paid. */
    PENDING,

    /** Payment has been received. */
    PAID,

    /** Order has been dispatched. */
    SHIPPED,

    /** Order has been delivered to the customer. */
    DELIVERED,

    /** Order was cancelled before fulfilment. */
    CANCELLED
}
