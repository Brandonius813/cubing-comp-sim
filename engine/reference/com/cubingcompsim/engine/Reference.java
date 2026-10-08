package com.cubingcompsim.engine;

import java.util.Random;
import java.util.Arrays;
import org.worldcubeassociation.tnoodle.scrambles.Puzzle;

/** JVM reference runs against byte-for-byte upstream source, with assertions enabled. */
public final class Reference {
    private static String json(String text) {
        return "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"")
            .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t") + "\"";
    }

    public static void main(String[] args) throws Exception {
        int samples = args.length > 0 ? Integer.parseInt(args[0]) : 1;
        for (String event : EngineCommon.EVENTS) {
            for (int sample = 0; sample < samples; sample++) {
                long began = System.nanoTime();
                int seed = 74013 + sample;
                String[] generated = EngineCommon.generate(event, new Random(seed));
                Puzzle puzzle = EngineCommon.puzzle(event);
                Puzzle.PuzzleState state = puzzle.getSolvedState().applyAlgorithm(generated[0]);
                if (state.solveIn(puzzle.getWcaMinScrambleDistance() - 1) != null) {
                    throw new AssertionError("Minimum distance failed for " + event);
                }
                if (!generated[1].startsWith("<svg") || !generated[1].contains("</svg>")) {
                    throw new AssertionError("SVG failed for " + event);
                }
                System.out.println("{\"eventId\":" + json(event) + ",\"seed\":" + seed
                    + ",\"randomVector\":" + Arrays.toString(EngineCommon.randomVector(new Random(seed)))
                    + ",\"notation\":" + json(generated[0]) + ",\"svg\":" + json(generated[1])
                    + ",\"jvmElapsedMs\":" + ((System.nanoTime() - began) / 1000000) + "}");
                System.err.println(event + " sample " + sample + " passed");
            }
        }
        try {
            EngineCommon.puzzle("333fm");
            throw new AssertionError("Excluded event accepted");
        } catch (IllegalArgumentException expected) {}
    }
}
