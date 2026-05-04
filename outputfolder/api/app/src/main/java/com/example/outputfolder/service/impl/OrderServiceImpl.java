package com.example.outputfolder.service.impl;

import com.example.outputfolder.domain.Order;
import com.example.outputfolder.domain.OrderItem;
import com.example.outputfolder.domain.OrderStatus;
import com.example.outputfolder.domain.Product;
import com.example.outputfolder.dto.OrderResponse;
import com.example.outputfolder.dto.PlaceOrderRequest;
import com.example.outputfolder.exception.BusinessException;
import com.example.outputfolder.exception.ResourceNotFoundException;
import com.example.outputfolder.mapper.OrderMapper;
import com.example.outputfolder.repository.OrderRepository;
import com.example.outputfolder.repository.ProductRepository;
import com.example.outputfolder.service.OrderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

/**
 * Default implementation of {@link OrderService}.
 * Ports {@code OrderService.cs} from ContosoStore.Api line-by-line, replacing
 * EF Core with Spring Data JPA and {@link OrderRepository}.
 */
@Service
@Transactional(readOnly = true)
public class OrderServiceImpl implements OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderServiceImpl.class);
    private static final Sort PLACED_AT_DESC = Sort.by(Sort.Direction.DESC, "placedAt");

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final OrderMapper orderMapper;

    /**
     * Constructs the service with its required collaborators.
     *
     * @param orderRepository   Spring Data JPA repository for orders
     * @param productRepository Spring Data JPA repository for products (stock management)
     * @param orderMapper       MapStruct mapper for entity ↔ DTO conversion
     */
    public OrderServiceImpl(OrderRepository orderRepository,
                            ProductRepository productRepository,
                            OrderMapper orderMapper) {
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.orderMapper = orderMapper;
    }

    /**
     * {@inheritDoc}
     *
     * <p>Mirrors:
     * <pre>{@code
     *   _db.Orders.Include(o => o.Items).FirstOrDefaultAsync(o => o.Id == id);
     * }</pre>
     */
    @Override
    public OrderResponse getOrder(Long id) {
        log.debug("Fetching order id={}", id);
        Order order = orderRepository.findWithItemsById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Order", id));
        return orderMapper.toResponse(order);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Mirrors:
     * <pre>{@code
     *   _db.Orders.Include(o => o.Items)
     *             .Where(o => o.CustomerEmail == email)
     *             .OrderByDescending(o => o.PlacedAt)
     *             .ToListAsync();
     * }</pre>
     */
    @Override
    public List<OrderResponse> listOrdersForCustomer(String email) {
        log.debug("Listing orders for customer email='{}'", email);
        return orderRepository.findByCustomerEmail(email, PLACED_AT_DESC)
                .stream()
                .map(orderMapper::toResponse)
                .toList();
    }

    /**
     * {@inheritDoc}
     *
     * <p>Mirrors:
     * <pre>{@code
     *   var order = new Order { CustomerEmail = email, Status = OrderStatus.Pending };
     *   foreach (var (pid, qty) in lines) {
     *       var product = await _db.Products.FindAsync(pid)
     *           ?? throw new InvalidOperationException($"Product {pid} not found");
     *       if (product.StockQuantity < qty)
     *           throw new InvalidOperationException($"Insufficient stock for {product.Name}");
     *       product.StockQuantity -= qty;
     *       order.Items.Add(new OrderItem { ProductId = pid, Quantity = qty, UnitPrice = product.Price });
     *       total += product.Price * qty;
     *   }
     *   order.TotalAmount = total;
     *   _db.Orders.Add(order);
     *   await _db.SaveChangesAsync();
     * }</pre>
     */
    @Override
    @Transactional
    public OrderResponse placeOrder(PlaceOrderRequest request) {
        log.info("Placing order for customer='{}'", request.customerEmail());

        Order order = new Order();
        order.setCustomerEmail(request.customerEmail());
        order.setStatus(OrderStatus.PENDING);

        BigDecimal total = BigDecimal.ZERO;

        for (PlaceOrderRequest.OrderItemRequest lineRequest : request.items()) {
            Long productId = lineRequest.productId();
            int qty = lineRequest.quantity();

            Product product = productRepository.findById(productId)
                    .orElseThrow(() -> new ResourceNotFoundException("Product", productId));

            if (product.getStockQuantity() < qty) {
                throw new BusinessException(
                        "Insufficient stock for product: " + product.getName()
                        + " (requested=" + qty + ", available=" + product.getStockQuantity() + ")");
            }

            product.setStockQuantity(product.getStockQuantity() - qty);
            productRepository.save(product);

            OrderItem item = new OrderItem();
            item.setOrder(order);
            item.setProductId(productId);
            item.setQuantity(qty);
            item.setUnitPrice(product.getPrice());
            order.getItems().add(item);

            total = total.add(product.getPrice().multiply(BigDecimal.valueOf(qty)));
        }

        order.setTotalAmount(total);
        Order saved = orderRepository.save(order);
        log.info("Order placed id={}, total={}", saved.getId(), saved.getTotalAmount());
        return orderMapper.toResponse(saved);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Mirrors:
     * <pre>{@code
     *   var o = await _db.Orders.FindAsync(id);
     *   if (o is null) return null;
     *   o.Status = status;
     *   await _db.SaveChangesAsync();
     * }</pre>
     */
    @Override
    @Transactional
    public OrderResponse updateOrderStatus(Long id, OrderStatus status) {
        log.info("Updating order id={} to status={}", id, status);
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Order", id));
        order.setStatus(status);
        Order saved = orderRepository.save(order);
        return orderMapper.toResponse(saved);
    }
}
