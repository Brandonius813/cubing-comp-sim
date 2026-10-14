"""Process an operator's local ElevenLabs download job file; never commit signed URLs.

Usage: python3 scripts/process-inspection-recordings.py /absolute/path/jobs.json
Each job has locale, slot, seconds, phrase, voice {name, voice_id}, generation_id,
and rawFile (absolute path). Outputs the immutable v1 pack and its provenance.
"""
import array
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import sys

FFMPEG = shutil.which('ffmpeg')
if not FFMPEG:
    raise SystemExit('ffmpeg is required to process the source recordings.')
ROOT = Path(__file__).resolve().parent.parent / 'public/audio/inspection/v1'
jobs = json.loads(Path(sys.argv[1]).read_text())
clips = []
for job in jobs:
    samples = array.array('f')
    samples.frombytes(subprocess.check_output([FFMPEG, '-v', 'error', '-i', job['rawFile'], '-ac', '1', '-ar', '44100', '-f', 'f32le', '-']))
    # Detect meaningful signal in 5 ms windows. Keep a short consonant-safe margin.
    frame = 220
    active = [i for i in range(0, len(samples), frame) if
              math.sqrt(sum(x*x for x in samples[i:i+frame]) / max(1, len(samples[i:i+frame]))) > 0.003]
    if not active:
        raise ValueError(f'Silent recording: {job["rawFile"]}')
    first = max(0, active[0] - 882)
    last = min(len(samples), active[-1] + frame + 3528)
    trimmed = samples[first:last]
    # Consistent short-phrase RMS, limited to -2 dBFS peak to leave MP3 headroom.
    rms = math.sqrt(sum(x*x for x in trimmed) / len(trimmed))
    peak = max(abs(x) for x in trimmed)
    gain = min(10 ** (-20 / 20) / rms, 10 ** (-2 / 20) / peak)
    processed = array.array('f', (x * gain for x in trimmed))
    duration = len(processed) / 44100
    if not 0.25 <= duration <= 3:
        raise ValueError(f'Unexpected duration {duration:.3f}: {job["rawFile"]}')
    relative = f'{job["locale"]}/{job["slot"]}-{job["seconds"]}.mp3'
    output = ROOT / relative
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([FFMPEG, '-v', 'error', '-y', '-f', 'f32le', '-ar', '44100', '-ac', '1', '-i', '-',
                    '-map_metadata', '-1', '-codec:a', 'libmp3lame', '-b:a', '128k', str(output)], input=processed.tobytes(), check=True)
    data = output.read_bytes()
    clips.append(dict(file=relative, locale=job['locale'], voice=job['slot'], seconds=job['seconds'], phrase=job['phrase'],
                      speaker=job['voice']['name'], voiceId=job['voice']['voice_id'], generationId=job['generation_id'],
                      durationSeconds=round(duration, 4), bytes=len(data), sha256=hashlib.sha256(data).hexdigest(),
                      sourceSha256=hashlib.sha256(Path(job['rawFile']).read_bytes()).hexdigest(),
                      leadingTrimSeconds=round(first / 44100, 4), gainDb=round(20 * math.log10(gain), 3)))
manifest = dict(version=1, provider='ElevenLabs', model='eleven_v4', generated='2026-10-14',
                promptTemplate='[matter of fact] {phrase}.', outputFormat='MP3, 44.1 kHz mono, 128 kbps',
                processing='Trim silence with 20 ms leading/80 ms trailing margins; target -20 dBFS RMS, limited to -2 dBFS peak.',
                licenseReference='https://elevenlabs.io/docs/overview/administration/billing', clips=clips)
(ROOT / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(dict(clips=len(clips), totalBytes=sum(x['bytes'] for x in clips), maxSeconds=max(x['durationSeconds'] for x in clips))))
