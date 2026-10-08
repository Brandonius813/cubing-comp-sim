package com.cubingcompsim.engine;

import java.security.SecureRandom;
import java.util.Random;
import org.teavm.jso.JSExport;
import org.worldcubeassociation.tnoodle.scrambles.InvalidScrambleException;

/** Only these functions cross the Java/browser boundary. */
public final class BrowserEngine {
    private static final Random ENTROPY = new JvmCompatibleRandom(new SecureRandom());

    private BrowserEngine() {}

    @JSExport
    public static String engineVersion() {
        return EngineCommon.VERSION;
    }

    @JSExport
    public static String[] generate(String event) throws InvalidScrambleException {
        return EngineCommon.generate(event, ENTROPY);
    }

    @JSExport
    public static String draw(String event, String notation) throws InvalidScrambleException {
        return EngineCommon.draw(event, notation);
    }

    /** Deterministic conformance input, never called by the application. */
    @JSExport
    public static String[] generateForConformance(String event, int seed) throws InvalidScrambleException {
        return EngineCommon.generate(event, new JvmCompatibleRandom(new Random(seed)));
    }

    @JSExport
    public static int[] randomVectorForConformance(int seed) {
        return EngineCommon.randomVector(new JvmCompatibleRandom(new Random(seed)));
    }

    @JSExport
    public static boolean meetsMinimumDistance(String event, String notation) throws InvalidScrambleException {
        org.worldcubeassociation.tnoodle.scrambles.Puzzle puzzle = EngineCommon.puzzle(event);
        return puzzle.getSolvedState().applyAlgorithm(notation)
            .solveIn(puzzle.getWcaMinScrambleDistance() - 1) == null;
    }
}
