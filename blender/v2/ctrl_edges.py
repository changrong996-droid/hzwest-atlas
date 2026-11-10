# 线稿兜底（detail=on）：Freestyle 在细节几何（约 100 万面）下太慢，改用控制图 EXR 做边缘检测，再与 detail=off 的 Freestyle 线稿（含四朵云等值线）取并集。
# 用法：Blender -b --factory-startup -P blender/v2/ctrl_edges.py -- <on 目录> <off 目录>
# 边 = 分割类别变化 ∪ 法线夹角 > 30°（屋面板类内部除外）∪ 相对深度跳变 > 1.5%；输出 <on>/s401_line.png（白底黑线）
import bpy, sys, os, struct, zlib, numpy as np
on, off = sys.argv[sys.argv.index('--') + 1:][:2]
def load(p, ch=4):
    im = bpy.data.images.load(p); w, h = im.size; a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a); return a.reshape(h, w, 4)
def png_write(path, a):
    a = np.ascontiguousarray(a[::-1]); h, w_ = a.shape[:2]; raw = a.astype(np.uint8).tobytes()
    data = b''.join(b'\x00' + raw[i * w_:(i + 1) * w_] for i in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w_, h, 8, 0, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(data, 6)) + chunk(b'IEND', b''))
sg = load(os.path.join(on, 's401_seg.exr')); nm = load(os.path.join(on, 's401_normal.exr')); dp = load(os.path.join(on, 's401_depth.exr'))
def nb(a, f):   # 与右、下邻像素比较
    e = np.zeros(a.shape[:2], bool); e[:, :-1] |= f(a[:, :-1], a[:, 1:]); e[:-1, :] |= f(a[:-1, :], a[1:, :]); return e
seg = np.round(sg[..., :3] * 255).astype(np.int32); seg = seg[..., 0] * 65536 + seg[..., 1] * 256 + seg[..., 2]
n = nm[..., :3] / np.maximum(nm[..., 3:4], 1e-6) * 2 - 1; n /= np.maximum(np.linalg.norm(n, axis=2, keepdims=True), 1e-6)
z = dp[..., 0] / np.maximum(dp[..., 3], 1e-6)
ROOF = 230 * 65536 + 25 * 256 + 75   # 屋面板类（含锁边肋）内部不取法线边：锁边肋 ≈2 px 一条，会变成满屋面噪点
NE = nb(n, lambda a, b: (a * b).sum(-1) < np.cos(np.radians(30))) & ~nb(seg, lambda a, b: (a == ROOF) & (b == ROOF))
E = nb(seg, lambda a, b: a != b) | NE | nb(z, lambda a, b: np.abs(a - b) / np.maximum(np.minimum(a, b), 1e-3) > 0.015)
lo = load(os.path.join(off, 's401_line.png'))[..., 0]   # off 线稿（灰度 0–1，白底）
L = np.minimum(lo, np.where(E, 0.0, 1.0)); png_write(os.path.join(on, 's401_line.png'), (L * 255 + 0.5).astype(np.uint8))
print('EDGES', round(float(E.mean()), 4), 'line_dark', round(float((L < 0.5).mean()), 4))
