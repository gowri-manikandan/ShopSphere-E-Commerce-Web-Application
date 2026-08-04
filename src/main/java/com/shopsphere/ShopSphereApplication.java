package com.shopsphere;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class ShopSphereApplication {

    public static void main(String[] args) {
        loadDotEnv();
        applyLocalMysqlFallbackIfNeeded();
        SpringApplication.run(ShopSphereApplication.class, args);
    }

    private static void loadDotEnv() {
        java.io.File envFile = new java.io.File(".env");
        if (envFile.exists()) {
            try (java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.FileReader(envFile))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    line = line.trim();
                    if (line.isEmpty() || line.startsWith("#")) {
                        continue;
                    }
                    int eqIdx = line.indexOf('=');
                    if (eqIdx > 0) {
                        String key = line.substring(0, eqIdx).trim();
                        String val = line.substring(eqIdx + 1).trim();
                        // Remove surrounding quotes if any
                        if (val.startsWith("\"") && val.endsWith("\"") && val.length() >= 2) {
                            val = val.substring(1, val.length() - 1);
                        } else if (val.startsWith("'") && val.endsWith("'") && val.length() >= 2) {
                            val = val.substring(1, val.length() - 1);
                        }
                        val = normalizeDotEnvValue(key, val);
                        // Only set if not already set by system or environment, unless the
                        // inherited environment value is the same malformed KEY=... pattern.
                        if (shouldSetDotEnvProperty(System.getProperty(key), System.getenv(key), key)) {
                            System.setProperty(key, val);
                        }
                    }
                }
            } catch (Exception e) {
                System.err.println("Could not load .env file: " + e.getMessage());
            }
        }
    }

    static String normalizeDotEnvValue(String key, String val) {
        String duplicatePrefix = key + "=";
        if (val.startsWith(duplicatePrefix)) {
            return val.substring(duplicatePrefix.length());
        }
        return val;
    }

    static boolean shouldSetDotEnvProperty(String existingSystemValue, String existingEnvValue, String key) {
        return existingSystemValue == null
                && (existingEnvValue == null || existingEnvValue.startsWith(key + "="));
    }

    static String extractMysqlHost(String dbUrl) {
        String normalizedUrl = normalizeDotEnvValue("DB_URL", dbUrl);
        String prefix = "jdbc:mysql://";
        if (!normalizedUrl.startsWith(prefix)) {
            return null;
        }

        String authorityAndPath = normalizedUrl.substring(prefix.length());
        int slashIndex = authorityAndPath.indexOf('/');
        int queryIndex = authorityAndPath.indexOf('?');
        int endIndex = authorityAndPath.length();
        if (slashIndex >= 0) {
            endIndex = Math.min(endIndex, slashIndex);
        }
        if (queryIndex >= 0) {
            endIndex = Math.min(endIndex, queryIndex);
        }

        String authority = authorityAndPath.substring(0, endIndex);
        int atIndex = authority.lastIndexOf('@');
        if (atIndex >= 0) {
            authority = authority.substring(atIndex + 1);
        }

        int colonIndex = authority.indexOf(':');
        return colonIndex >= 0 ? authority.substring(0, colonIndex) : authority;
    }

    static boolean shouldUseLocalMysqlFallback(boolean hostResolvable, boolean localMysqlAvailable) {
        return !hostResolvable && localMysqlAvailable;
    }

    private static void applyLocalMysqlFallbackIfNeeded() {
        String dbUrl = System.getProperty("DB_URL");
        if (dbUrl == null) {
            dbUrl = System.getenv("DB_URL");
        }

        if (dbUrl == null) {
            return;
        }

        String dbHost = extractMysqlHost(dbUrl);
        if (dbHost == null) {
            return;
        }

        boolean hostResolvable = isHostResolvable(dbHost);
        boolean localMysqlAvailable = isLocalMysqlAvailable();
        if (!shouldUseLocalMysqlFallback(hostResolvable, localMysqlAvailable)) {
            if (!hostResolvable) {
                System.err.println("Configured MySQL host '" + dbHost + "' is unreachable and localhost:3306 is not available.");
            }
            return;
        }

        System.err.println("Configured MySQL host '" + dbHost + "' is unreachable; using local MySQL on localhost:3306 for startup.");
        System.setProperty("DB_URL",
                "jdbc:mysql://localhost:3306/shopsphere?createDatabaseIfNotExist=true&useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC");
        System.setProperty("DB_USERNAME", "root");
        System.setProperty("DB_PASSWORD", "12345678");
    }

    private static boolean isHostResolvable(String host) {
        try {
            java.net.InetAddress.getByName(host);
            return true;
        } catch (java.net.UnknownHostException ex) {
            return false;
        }
    }

    private static boolean isLocalMysqlAvailable() {
        try (java.net.Socket socket = new java.net.Socket()) {
            socket.connect(new java.net.InetSocketAddress("localhost", 3306), 1000);
            return true;
        } catch (java.io.IOException ex) {
            return false;
        }
    }
}
