package com.shopsphere.search;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * Enables @Async and provides the executor used for off-request embedding generation.
 * Kept here (not on the main class) so async support is scoped to this feature.
 */
@Configuration
@EnableAsync
public class EmbeddingConfig {

    @Bean(name = "embeddingExecutor")
    public Executor embeddingExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(100);
        executor.setThreadNamePrefix("embed-");
        executor.initialize();
        return executor;
    }
}
