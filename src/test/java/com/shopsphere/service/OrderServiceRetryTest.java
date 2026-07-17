package com.shopsphere.service;

import com.shopsphere.dto.OrderRequest;
import com.shopsphere.dto.OrderResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Verifies the optimistic-lock retry wrapper in isolation. The @Lazy self-proxy is a
 * Mockito mock so we can drive doCheckout to conflict on demand without a database.
 * MAX_STOCK_CONFLICT_ATTEMPTS is 3.
 */
@ExtendWith(MockitoExtension.class)
class OrderServiceRetryTest {

    @Mock OrderService self;

    OrderService orderService;

    @BeforeEach
    void setUp() {
        // Only the retry wrapper + `self` are exercised here; repos are never touched.
        orderService = new OrderService(null, null, null, null, null, null, self);
    }

    private OrderRequest request() {
        OrderRequest r = new OrderRequest();
        r.setAddressId(5L);
        r.setPaymentMethod("CARD");
        return r;
    }

    private ObjectOptimisticLockingFailureException conflict() {
        return new ObjectOptimisticLockingFailureException("Product", 1L);
    }

    @Test
    void checkout_retriesThenRethrows_whenConflictPersists() {
        OrderRequest req = request();
        when(self.doCheckout(req)).thenThrow(conflict());

        assertThatThrownBy(() -> orderService.checkout(req))
                .isInstanceOf(ObjectOptimisticLockingFailureException.class);

        verify(self, times(3)).doCheckout(req); // exhausts all attempts
    }

    @Test
    void checkout_succeedsOnThirdAttempt_afterTwoConflicts() {
        OrderRequest req = request();
        OrderResponse success = OrderResponse.builder().orderId(100L).status("PLACED").build();
        when(self.doCheckout(req))
                .thenThrow(conflict())
                .thenThrow(conflict())
                .thenReturn(success);

        OrderResponse result = orderService.checkout(req);

        assertThat(result.getOrderId()).isEqualTo(100L);
        verify(self, times(3)).doCheckout(req);
    }

    @Test
    void checkout_retriesOnDeadlock_notJustOptimisticLock() {
        // A real MySQL deadlock surfaces as CannotAcquireLockException, not an optimistic-lock
        // failure. The retry must cover it too (both are ConcurrencyFailureException).
        OrderRequest req = request();
        OrderResponse success = OrderResponse.builder().orderId(101L).status("PLACED").build();
        when(self.doCheckout(req))
                .thenThrow(new CannotAcquireLockException("Deadlock found"))
                .thenReturn(success);

        OrderResponse result = orderService.checkout(req);

        assertThat(result.getOrderId()).isEqualTo(101L);
        verify(self, times(2)).doCheckout(req);
    }

    @Test
    void cancelOrder_retriesThenRethrows_whenConflictPersists() {
        when(self.doCancelOrder(100L)).thenThrow(conflict());

        assertThatThrownBy(() -> orderService.cancelOrder(100L))
                .isInstanceOf(ObjectOptimisticLockingFailureException.class);

        verify(self, times(3)).doCancelOrder(100L);
    }
}
