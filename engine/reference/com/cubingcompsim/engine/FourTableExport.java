package com.cubingcompsim.engine;

import java.io.BufferedOutputStream;
import java.io.DataOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;

/** Build-time cache of upstream deterministic tables, never random scrambles. */
public final class FourTableExport {
    public static void main(String[] args) throws Exception {
        if (args.length != 1) throw new IllegalArgumentException("Expected output path");
        try (DataOutputStream out = new DataOutputStream(new BufferedOutputStream(Files.newOutputStream(Path.of(args[0]))))) {
            cs.threephase.Tools.saveTo(out);
        }
    }
}
