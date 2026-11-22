#!/usr/bin/env python3
"""Pack the lab's 3D objects into one small binary for the browser. Standard library only.

    python3 tools/lab_models.py iccas_objects.glb src/img/lab-objects.bin

The input is a glTF binary (.glb) with one mesh per node (the monkey head and the torus exported from the
ICCAS 2026 scene). Each node's rotation is applied to its vertices and normals; its translation and
scale are left out, because the lab places the objects itself. Output, little-endian:

    "LABM", u32 version (1), u32 object count
    per object: u32 vertex count, u32 index count, f32 position scale (metres for 32767),
                i16 positions (x, y, z per vertex), i8 normals (x, y, z per vertex),
                u16 triangle indices; each array is padded to 4 bytes
"""
import json
import struct
import sys


def read_glb(path):
    b = open(path, "rb").read()
    magic, _, _ = struct.unpack_from("<4sII", b, 0)
    if magic != b"glTF":
        sys.exit("not a .glb file")
    n0, t0 = struct.unpack_from("<I4s", b, 12)
    doc = json.loads(b[20:20 + n0])
    n1, t1 = struct.unpack_from("<I4s", b, 20 + n0)
    return doc, b[28 + n0:28 + n0 + n1]


def accessor(doc, binary, i):
    a = doc["accessors"][i]
    v = doc["bufferViews"][a["bufferView"]]
    fmt = {5126: "f", 5123: "H", 5125: "I"}[a["componentType"]]
    width = {"SCALAR": 1, "VEC3": 3}[a["type"]]
    start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    flat = struct.unpack_from("<" + fmt * (a["count"] * width), binary, start)
    return [flat[k:k + width] for k in range(0, len(flat), width)] if width > 1 else list(flat)


def rotate(q, p):
    x, y, z, w = q
    # v' = v + 2w (q x v) + 2 q x (q x v)
    cx, cy, cz = y * p[2] - z * p[1], z * p[0] - x * p[2], x * p[1] - y * p[0]
    dx, dy, dz = y * cz - z * cy, z * cx - x * cz, x * cy - y * cx
    return (p[0] + 2 * (w * cx + dx), p[1] + 2 * (w * cy + dy), p[2] + 2 * (w * cz + dz))


def pad(b):
    return b + b"\0" * (-len(b) % 4)


def main(src, dst):
    doc, binary = read_glb(src)
    out = [b"LABM", struct.pack("<II", 1, 0)]
    count = 0
    for node in doc["nodes"]:
        if "mesh" not in node:
            continue
        prim = doc["meshes"][node["mesh"]]["primitives"][0]
        q = node.get("rotation", [0, 0, 0, 1])
        pos = [rotate(q, p) for p in accessor(doc, binary, prim["attributes"]["POSITION"])]
        nrm = [rotate(q, n) for n in accessor(doc, binary, prim["attributes"]["NORMAL"])]
        idx = accessor(doc, binary, prim["indices"])
        if len(pos) > 65535:
            sys.exit(f"{node.get('name')}: too many vertices for 16-bit indices")
        scale = max(abs(c) for p in pos for c in p) or 1.0
        q16 = struct.pack(f"<{len(pos) * 3}h", *(round(c / scale * 32767) for p in pos for c in p))
        n8 = struct.pack(f"<{len(nrm) * 3}b", *(max(-127, min(127, round(c * 127))) for n in nrm for c in n))
        i16 = struct.pack(f"<{len(idx)}H", *idx)
        out += [struct.pack("<IIf", len(pos), len(idx), scale), pad(q16), pad(n8), pad(i16)]
        count += 1
        print(f"{node.get('name')}: {len(pos)} vertices, {len(idx) // 3} triangles")
    out[1] = struct.pack("<II", 1, count)
    data = b"".join(out)
    open(dst, "wb").write(data)
    print(f"{dst}: {len(data):,} bytes")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
