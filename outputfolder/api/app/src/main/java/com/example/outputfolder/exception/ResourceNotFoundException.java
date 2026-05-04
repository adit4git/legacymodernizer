package com.example.outputfolder.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Thrown when a requested resource does not exist (or has been soft-deleted).
 * Mapped to HTTP 404 by {@link GlobalExceptionHandler}.
 *
 * <p>Example usage:
 * <pre>{@code
 *   throw new ResourceNotFoundException("Product", id);
 * }</pre>
 */
@ResponseStatus(HttpStatus.NOT_FOUND)
public class ResourceNotFoundException extends RuntimeException {

    /**
     * Creates an exception with a descriptive message.
     *
     * @param resourceType human-readable name of the resource type (e.g. "Product")
     * @param identifier   the identifier that was not found
     */
    public ResourceNotFoundException(String resourceType, Object identifier) {
        super(resourceType + " not found with identifier: " + identifier);
    }

    /**
     * Creates an exception with a fully custom message.
     *
     * @param message descriptive error message
     */
    public ResourceNotFoundException(String message) {
        super(message);
    }
}
