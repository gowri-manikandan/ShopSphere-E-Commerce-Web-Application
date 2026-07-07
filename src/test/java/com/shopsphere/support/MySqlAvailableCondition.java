package com.shopsphere.support;

import org.junit.jupiter.api.extension.ConditionEvaluationResult;
import org.junit.jupiter.api.extension.ExecutionCondition;
import org.junit.jupiter.api.extension.ExtensionContext;

import java.sql.Connection;
import java.sql.DriverManager;
import java.util.Properties;

/**
 * JUnit 5 execution condition that probes for a reachable local MySQL BEFORE the Spring
 * context loads. If MySQL is unreachable the annotated test is skipped (not errored), so
 * DB-less builds stay green. Runs earlier than SpringExtension's context bootstrap, which
 * is why a plain @BeforeAll assumption would be too late.
 */
public class MySqlAvailableCondition implements ExecutionCondition {

    private static final String URL = System.getenv().getOrDefault("TEST_DB_URL",
            "jdbc:mysql://localhost:3306/?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC&connectTimeout=2000");
    private static final String USER = System.getenv().getOrDefault("DB_USERNAME", "root");
    private static final String PASSWORD = System.getenv().getOrDefault("DB_PASSWORD", "12345678");

    @Override
    public ConditionEvaluationResult evaluateExecutionCondition(ExtensionContext context) {
        Properties props = new Properties();
        props.setProperty("user", USER);
        props.setProperty("password", PASSWORD);
        props.setProperty("connectTimeout", "2000");
        try (Connection ignored = DriverManager.getConnection(URL, props)) {
            return ConditionEvaluationResult.enabled("Local MySQL reachable");
        } catch (Exception e) {
            return ConditionEvaluationResult.disabled(
                    "Local MySQL not reachable — skipping DB-backed concurrency test: " + e.getMessage());
        }
    }
}
