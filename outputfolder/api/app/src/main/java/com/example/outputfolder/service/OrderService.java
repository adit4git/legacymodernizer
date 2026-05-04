package com.example.outputfolder.service;

import com.example.outputfolder.domain.OrderStatus;
import com.example.outputfolder.dto.OrderResponse;
import com.example.outputfolder.dto.PlaceOrderRequest;

import java.util.List;

/**
 * Business-logic contract for order lifecycle operations.
 * Mirrors {@code IOrderService} from {@code ContosoStore.Api/Services/OrderService.cs}.
 */
public interface OrderService {

    /**
     * Retrieves a single order (with its items) by identifier.
     *
     * @param id the order's primary key
     * @return the order DTO
     * @throws com.example.outputfolder.exception.ResourceNotFoundException if not found
     */
    OrderResponse getOrder(Long id);

    /**
     * Returns all orders placed by a specific customer, newest first.
     *
     * @param email the customer's e-mail address
     * @return list of order DTOs; empty if no orders exist for the customer
     */
    List<OrderResponse> listOrdersForCustomer(String email);

    /**
     * Places a new order, validates stock availability, and decrements product quantities.
     *
     * @param request validated order payload containing customer e-mail and line items
     * @return the newly created order DTO
     * @throws com.example.outputfolder.exception.ResourceNotFoundException if a product is missing
     * @throws com.example.outputfolder.exception.BusinessException if insufficient stock
     */
    OrderResponse placeOrder(PlaceOrderRequest request);

    /**
     * Transitions an existing order to a new status.
     *
     * @param id     the order's primary key
     * @param status the new lifecycle status to apply
     * @return the updated order DTO
     * @throws com.example.outputfolder.exception.ResourceNotFoundException if not found
     */
    OrderResponse updateOrderStatus(Long id, OrderStatus status);
}
