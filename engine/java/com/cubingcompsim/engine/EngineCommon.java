package com.cubingcompsim.engine;

import java.util.HashMap;
import java.util.Map;
import java.util.Random;
import org.worldcubeassociation.tnoodle.puzzle.*;
import org.worldcubeassociation.tnoodle.scrambles.Puzzle;
import org.worldcubeassociation.tnoodle.scrambles.InvalidScrambleException;

/** The explicit event mapping avoids reflective construction in a browser. */
public final class EngineCommon {
    public static final String VERSION = "tnoodle-lib@d01a947d9f028f38085cda9b0507a9cf3d3f38a8+webcrypto.2";
    public static final String[] EVENTS = {
        "222", "333", "444", "555", "666", "777", "333oh", "333bf",
        "444bf", "555bf", "minx", "pyram", "skewb", "sq1", "fto", "clock"
    };
    private static final Map<String, Puzzle> PUZZLES = new HashMap<>();

    private EngineCommon() {}

    public static int[] randomVector(Random entropy) {
        int[] bounds = {1, 2, 3, 12, 729, 5040, 40320, 239500800, 479001600,
            1073741824, 1073741825, Integer.MAX_VALUE};
        int[] values = new int[bounds.length * 8];
        for (int i = 0; i < values.length; i++) {
            values[i] = entropy.nextInt(bounds[i % bounds.length]);
        }
        return values;
    }

    public static Puzzle puzzle(String event) {
        Puzzle existing = PUZZLES.get(event);
        if (existing != null) return existing;
        Puzzle created;
        switch (event) {
            case "222": created = new TwoByTwoCubePuzzle(); break;
            case "333":
            case "333oh": created = new ThreeByThreeCubePuzzle(); break;
            case "444": created = new FourByFourCubePuzzle(); break;
            case "555": created = new CubePuzzle(5); break;
            case "666": created = new CubePuzzle(6); break;
            case "777": created = new CubePuzzle(7); break;
            case "333bf": created = new NoInspectionThreeByThreeCubePuzzle(); break;
            case "444bf": created = new NoInspectionFourByFourCubePuzzle(); break;
            case "555bf": created = new NoInspectionFiveByFiveCubePuzzle(); break;
            case "minx": created = new MegaminxPuzzle(); break;
            case "pyram": created = new PyraminxPuzzle(); break;
            case "skewb": created = new SkewbPuzzle(); break;
            case "sq1": created = new SquareOnePuzzle(); break;
            case "fto": created = new FaceTurningOctahedronPuzzle(); break;
            case "clock": created = new ClockPuzzle(); break;
            default: throw new IllegalArgumentException("Unsupported event: " + event);
        }
        PUZZLES.put(event, created);
        return created;
    }

    public static String[] generate(String event, Random entropy) throws InvalidScrambleException {
        Puzzle puzzle = puzzle(event);
        String notation = puzzle.generateWcaScramble(entropy);
        return new String[] {notation, puzzle.drawScramble(notation, null).toString()};
    }

    public static String draw(String event, String notation) throws InvalidScrambleException {
        return puzzle(event).drawScramble(notation, null).toString();
    }
}
