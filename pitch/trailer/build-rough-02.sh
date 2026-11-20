#!/bin/bash
# Rough 02: the N3ON clip intercut with the reaction posts.
# Each post cuts in full screen on its own page colour, pops in, and lands with a hit sound.
# Posts come faster toward the end; the last one holds.
set -euo pipefail
cd "$(dirname "$0")"
CLIP=src/n3on-first-15s.mp4
P=src/posts
HIT=src/sfx/sting_death_bass_drum_boom.mp3
LAST=src/sfx/sting_death_trailer_boom.mp3
TMP=out/.rough02
rm -rf "$TMP"; mkdir -p "$TMP"
: > "$TMP/list.txt"
n=0

enc() { echo -c:v libx264 -crf 17 -preset fast -pix_fmt yuv420p -r 24 -c:a aac -b:a 192k -ar 48000 -ac 2; }

clip() { # start duration
  n=$((n+1)); f=$(printf "%s/seg%02d.mp4" "$TMP" $n)
  fo=$(python3 -c "print(f'{$2-0.03:.2f}')")
  ffmpeg -v error -y -ss "$1" -t "$2" -i "$CLIP" \
    -vf "scale=1920:1080:flags=lanczos,fps=24" \
    -af "afade=t=in:d=0.02,afade=t=out:st=$fo:d=0.03" \
    $(enc) "$f"
  echo "file '$(basename "$f")'" >> "$TMP/list.txt"
}

post() { # image bg-hex duration sfx gain-dB
  n=$((n+1)); f=$(printf "%s/seg%02d.mp4" "$TMP" $n)
  d=$3
  fo=$(python3 -c "print(f'{$d-0.2:.2f}')")
  ffmpeg -v error -y \
    -f lavfi -i "color=c=0x$2:s=1920x1080:r=24:d=$d" \
    -loop 1 -framerate 24 -t "$d" -i "$P/$1" \
    -i "$4" \
    -filter_complex "[1:v]scale=w='2*trunc(1720*(0.82+0.18*min(t/0.09\,1)+0.035*t/$d)/2)':h=-2:eval=frame:flags=lanczos[s];[0:v][s]overlay=(W-w)/2:(H-h)/2:eval=frame[v];[2:a]atrim=0:$d,volume=$5dB,afade=t=out:st=$fo:d=0.2,apad=whole_dur=$d[a]" \
    -map "[v]" -map "[a]" -t "$d" $(enc) "$f"
  echo "file '$(basename "$f")'" >> "$TMP/list.txt"
}

clip 0.0 3.2
post reddit-lsf-backlash-headline.png fbf9fe 2.2 "$HIT" -4
clip 3.2 1.8
post x-zigzagfilla-dumbest.png ffffff 1.7 "$HIT" -4
clip 5.0 1.6
post x-maya-never-has-to-stop.png ffffff 1.5 "$HIT" -4
clip 8.75 1.25
post x-thefloor-wild-concept.png ffffff 0.9 "$HIT" -4
clip 10.5 1.0
post x-pttcoin-ai-take-over.png f9f9f9 1.0 "$HIT" -4
clip 12.5 0.8
post reddit-dead-internet-theory.png fbf9fe 2.6 "$LAST" -3

ffmpeg -v error -y -f concat -safe 0 -i "$TMP/list.txt" -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p -c:a aac -b:a 192k out/rough-02-intercut-pops.mp4
rm -rf "$TMP"
ffprobe -v error -show_entries format=duration -of csv=p=0 out/rough-02-intercut-pops.mp4
