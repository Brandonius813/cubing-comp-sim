package org.slf4j;
/** Only the two diagnostic methods reached by the vendored solvers. */
public interface Logger {
    void info(String message);
    void debug(String message);
}
