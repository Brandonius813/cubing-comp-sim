package com.cubingcompsim.engine;

import java.util.Random;

/**
 * Preserves java.util.Random's specified bounded-integer sampling across runtimes.
 * TeaVM 0.16's RandomGenerator default uses a different bit-mask rejection method.
 * Both are uniform, but their seeded streams are not equivalent.
 *
 * Specification:
 * https://docs.oracle.com/en/java/javase/21/docs/api/java.base/java/util/Random.html#nextInt(int)
 * Production entropy is WebCrypto-backed SecureRandom, never this class's seed.
 */
public final class JvmCompatibleRandom extends Random {
    private final Random entropy;

    public JvmCompatibleRandom(Random entropy) {
        super(0);
        if (entropy == null) throw new NullPointerException("entropy");
        this.entropy = entropy;
    }

    @Override
    protected int next(int bits) {
        if (bits < 1 || bits > 32) throw new IllegalArgumentException("bits");
        return entropy.nextInt() >>> (32 - bits);
    }

    @Override
    public int nextInt() {
        return entropy.nextInt();
    }

    @Override
    public int nextInt(int bound) {
        if (bound < 1) throw new IllegalArgumentException("bound must be positive");
        if ((bound & (bound - 1)) == 0) {
            return (int) (((long) bound * next(31)) >>> 31);
        }
        while (true) {
            int candidate = next(31);
            int result = candidate % bound;
            // Overflow identifies the incomplete final bucket. Rejecting it
            // keeps every result equally likely, matching the JVM contract.
            if (candidate - result + (bound - 1) >= 0) return result;
        }
    }
}
