package org.slf4j;
/** Solver initialization diagnostics are silent; generation errors still throw. */
public final class LoggerFactory {
    private static final Logger QUIET = new Logger() {
        public void info(String message) {}
        public void debug(String message) {}
    };
    private LoggerFactory() {}
    public static Logger getLogger(Class<?> type) { return QUIET; }
}
