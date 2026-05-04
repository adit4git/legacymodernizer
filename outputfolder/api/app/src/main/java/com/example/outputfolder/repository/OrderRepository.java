package com.example.outputfolder.repository;

import com.example.outputfolder.domain.Order;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * Spring Data JPA repository for {@link Order} entities.
 *
 * <p>Replaces the Entity Framework queries from
 * {@code ContosoStore.Api/Data/StoreDbContext.cs} that operated on
 * {@code DbSet<Order>}, restoring the {@code .Include(o => o.Items)}
 * eagerness via a JPQL JOIN FETCH.
 */
@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    /**
     * Loads an order together with its {@code items} collection in a single query.
     *
     * <p>Mirrors:
     * <pre>{@code
     *   _db.Orders.Include(o => o.Items).FirstOrDefaultAsync(o => o.Id == id);
     * }</pre>
     *
     * <p>Without the {@code JOIN FETCH} the {@code items} list would trigger
     * an N+1 lazy-load when the mapper accesses it.
     *
     * @param id the order's primary key
     * @return an {@link Optional} containing the fully-loaded order, or empty
     */
    @Query("SELECT o FROM Order o LEFT JOIN FETCH o.items WHERE o.id = :id")
    Optional<Order> findWithItemsById(@Param("id") Long id);

    /**
     * Returns all orders for a customer, sorted by the supplied {@link Sort} descriptor.
     *
     * <p>Mirrors:
     * <pre>{@code
     *   _db.Orders.Include(o => o.Items)
     *             .Where(o => o.CustomerEmail == email)
     *             .OrderByDescending(o => o.PlacedAt)
     *             .ToListAsync();
     * }</pre>
     *
     * @param customerEmail the customer's e-mail address
     * @param sort          sort descriptor (callers typically pass {@code Sort.by(DESC,"placedAt")})
     * @return ordered list of matching orders; empty if no orders exist
     */
    List<Order> findByCustomerEmail(String customerEmail, Sort sort);
}
