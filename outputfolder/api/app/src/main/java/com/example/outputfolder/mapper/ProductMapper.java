package com.example.outputfolder.mapper;

import com.example.outputfolder.domain.Product;
import com.example.outputfolder.dto.ProductRequest;
import com.example.outputfolder.dto.ProductResponse;
import org.mapstruct.*;

/**
 * MapStruct mapper for converting between {@link Product} entities and
 * {@link ProductRequest} / {@link ProductResponse} DTOs.
 *
 * <p>MapStruct generates a Spring-managed implementation ({@code @Component})
 * at compile time. The generated bean can be injected anywhere via
 * {@code @Autowired} or constructor injection.
 *
 * <p>Lifecycle fields ({@code createdAt}, {@code updatedAt}, {@code isActive})
 * are never set from the request — they are managed by the entity itself.
 */
@Mapper(
    componentModel = "spring",
    nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE,
    unmappedTargetPolicy = ReportingPolicy.ERROR
)
public interface ProductMapper {

    /**
     * Converts a {@link ProductRequest} to a new {@link Product} entity.
     *
     * <p>The {@code id}, {@code createdAt}, {@code updatedAt}, and {@code isActive}
     * fields are excluded and managed by JPA / {@code @PrePersist}.
     *
     * @param request the validated request DTO
     * @return a new, un-persisted entity with all mutable fields populated
     */
    @Mapping(target = "id",        ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "active",    ignore = true)
    Product toEntity(ProductRequest request);

    /**
     * Applies the mutable fields from {@code request} to an existing {@code entity}.
     * Used by the update flow to avoid detaching / re-attaching the managed entity.
     *
     * @param request the validated update payload
     * @param entity  the existing managed entity to update (modified in-place)
     */
    @Mapping(target = "id",        ignore = true)
    @Mapping(target = "createdAt", ignore = true)
    @Mapping(target = "updatedAt", ignore = true)
    @Mapping(target = "active",    ignore = true)
    void updateEntity(ProductRequest request, @MappingTarget Product entity);

    /**
     * Converts a {@link Product} entity to a {@link ProductResponse} DTO.
     *
     * @param product the managed entity
     * @return the immutable response record
     */
    ProductResponse toResponse(Product product);
}
