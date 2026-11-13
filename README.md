# Fokus Kuliah 🎓⏱️

Timer pomodoro 25/5 menit + daftar deadline kuliah sederhana.
Satu halaman web, tanpa akun, tanpa backend — data tersimpan di `localStorage` browser.

Project untuk target mingguan: 1 project + 2 konten (minggu 16–22 Nov 2026).
## Live demo

Coba langsung tanpa install: **[weinssy.github.io/fokus-kuliah](https://weinssy.github.io/fokus-kuliah/)**

## Cara menjalankan

Tidak perlu install apa pun:

1. Clone repo ini, atau download sebagai ZIP.
2. Buka `index.html` di browser.

Opsional, kalau ingin lewat server lokal:

```bash
npx serve .
# atau
python3 -m http.server
```

## Fitur MVP

- **Timer Pomodoro** — mode Fokus 25 menit dan Istirahat 5 menit, tombol Mulai / Jeda / Reset, ganti mode, judul tab browser menampilkan sisa waktu, hitungan sesi fokus selesai, notifikasi saat sesi selesai.
- **Daftar deadline** — tambah tugas (nama, mata kuliah, tanggal), tandai selesai, hapus, urut otomatis dari deadline terdekat, tersimpan di `localStorage`.

## Struktur file

```
fokus-kuliah/
  index.html   kerangka halaman (timer + form deadline)
  style.css    tampilan
  script.js    logika timer dan deadline
  README.md
```

## Checklist minggu ini

- [x] Kode awal: timer + deadline jalan
- [ ] Selasa–Rabu: tes sendiri, perbaiki yang terasa janggal
- [ ] Kamis: polish tampilan, ambil screenshot untuk README, rekam demo vertikal 30–45 detik
- [ ] Jumat: konten demo terbit (TikTok + YouTube Shorts)

## Sengaja ditunda (bukan bagian MVP)

Statistik belajar mingguan, sinkron kalender, akun pengguna, durasi custom, tema / dark mode.
