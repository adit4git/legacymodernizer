package com.example.outputfolder.mapper;

import com.example.outputfolder.domain.Order;
import com.example.outputfolder.domain.OrderItem;
import com.example.outputfolder.dto.OrderItemResponse;
import com.example.outputfolder.dto.OrderResponse;
import org.mapstruct.*;

import java.math.BigDecimal;

/**
 * MapStruct mapper for converting {@link Order} and {@link OrderItem} entities
 * to their respective response DTOs.
 *
 * <p>No request-to-entity mapping is declared here because order creation is
 * handled imperatively in
 * {@link com.example.outputfolder.service.impl.OrderServiceImpl#placeOrder},
 * where stock validation and line-total calculation require explicit logic.
 */
@Mapper(
    componentModel = "spring",
    unmappedTargetPolicy = ReportingPolicy.ERROR
)
public interface OrderMapper {

    /**
     * Converts an {@link Order} entity (with its eagerly-loaded {@code items})
     * to an {@link OrderResponse} DTO.
     *
     * @param order the managed entity
     * @return the immutable response record including nested item list
     */
    OrderResponse toResponse(Order order);

    /**
     * Converts a single {@link OrderItem} entity to an {@link OrderItemResponse} DTO.
     *
     * <p>{@code lineTotal} is computed as {@code unitPrice × quantity}; MapStruct
     * cannot derive this automatically, so we supply a default method.
     *
     * @param item the order line-item entity
     * @return the immutable response record
     */
    @Mapping(target = "lineTotal", expression = "java(computeLineTotal(item))")
    OrderItemResponse toItemResponse(OrderItem item);

    /**
     * Computes the line total for an order item.
     *
     * @param item the order item
     * @return {@code item.unitPrice × item.quantity}
     */
    default BigDecimal computeLineTotal(OrderItem item) {
        return item.getUnitPrice().multiply(BigDecimal.valueOf(item.getQuantity()));
    }
}
