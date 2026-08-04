package com.shopsphere;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ShopSphereApplicationTest {

    @Test
    void normalizeDotEnvValueStripsDuplicateKeyPrefix() {
        assertEquals(
                "jdbc:mysql://example.com:3306/defaultdb?sslMode=REQUIRED&serverTimezone=UTC",
                ShopSphereApplication.normalizeDotEnvValue(
                        "DB_URL",
                        "DB_URL=jdbc:mysql://example.com:3306/defaultdb?sslMode=REQUIRED&serverTimezone=UTC"));
    }

    @Test
    void normalizeDotEnvValueLeavesNormalValuesUntouched() {
        assertEquals("avnadmin", ShopSphereApplication.normalizeDotEnvValue("DB_USERNAME", "avnadmin"));
    }

    @Test
    void shouldSetDotEnvPropertyWhenEnvironmentValueIsMalformed() {
        assertTrue(ShopSphereApplication.shouldSetDotEnvProperty(null,
                "DB_URL=jdbc:mysql://example.com:3306/defaultdb", "DB_URL"));
    }

    @Test
    void shouldNotSetDotEnvPropertyWhenEnvironmentValueIsHealthy() {
        assertFalse(ShopSphereApplication.shouldSetDotEnvProperty(null,
                "jdbc:mysql://example.com:3306/defaultdb", "DB_URL"));
    }

    @Test
    void extractMysqlHostReturnsHostWithoutCredentialsOrQuery() {
        assertEquals("mysql.example.com",
                ShopSphereApplication.extractMysqlHost(
                        "jdbc:mysql://dbuser:secret@mysql.example.com:3306/defaultdb?sslMode=REQUIRED&serverTimezone=UTC"));
    }

    @Test
    void shouldUseLocalMysqlFallbackOnlyWhenRemoteHostFailsAndLocalMysqlExists() {
        assertTrue(ShopSphereApplication.shouldUseLocalMysqlFallback(false, true));
        assertFalse(ShopSphereApplication.shouldUseLocalMysqlFallback(false, false));
        assertFalse(ShopSphereApplication.shouldUseLocalMysqlFallback(true, true));
    }
}
