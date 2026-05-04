package com.example.outputfolder.exception;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.ResponseStatus;

/**
 * Thrown when a business-rule violation is detected (e.g. insufficient stock).
 * Mapped to HTTP 400 by {@link GlobalExceptionHandler}.
 *
 * <p>Mirrors the {@link IllegalStateException} / {@link java.lang.IllegalArgumentException}
 * patterns in the legacy .NET service layer that were returned as 400 Bad Request.
 *
 * <p>Example usage:
 * <pre>{@code
 *   throw new BusinessException("Insufficient stock for product: " + product.getName());
 * }</pre>
 */
@ResponseStatus(HttpStatus.BAD_REQUEST)
public class BusinessException extends RuntimeException {

    /**
     * Creates a business exception with a descriptive message.
     *
     * @param message human-readable description of the rule violation
     */
    public BusinessException(String message) {
        super(message);
    }

    /**
     * Creates a business exception wrapping an underlying cause.
     *
     * @param message human-readable description of the rule violation
     * @param cause   the underlying exception
     */
    public BusinessException(String message, Throwable cause) {
        super(message, cause);
    }
}
