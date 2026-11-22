# Fokus Kuliah

Timer pomodoro (bawaan 25/5 menit, durasi dapat diatur) dan daftar deadline kuliah dalam satu halaman web. Tanpa akun, tanpa backend, dan semua data tersimpan di `localStorage` browser.

## Live demo

Coba langsung tanpa instalasi di [weinssy.github.io/fokus-kuliah](https://weinssy.github.io/fokus-kuliah/).

## Cara menjalankan

Tidak perlu menginstal dependensi apa pun:

1. Clone repo ini atau unduh sebagai ZIP.
2. Buka `index.html` langsung di browser.

Jika ingin menjalankan lewat server lokal (diperlukan agar caching offline Service Worker aktif):

```bash
npx serve .
# atau
python -m http.server 8080
```

## Fitur

- **Timer Pomodoro:** siklus penuh berisi mode Fokus (bawaan 25 menit), Istirahat (bawaan 5 menit), dan Istirahat Panjang (bawaan 15 menit) yang otomatis menjadi jeda setelah 4 sesi fokus selesai. Dilengkapi penanda posisi siklus, tombol Mulai / Lanjutkan / Jeda / Reset / Lewati sesi, pintasan keyboard (`Spasi` untuk mulai/jeda, `R` untuk reset), tampilan sisa waktu di judul tab browser, penghitung sesi fokus selesai harian, bunyi penanda Web Audio API (dengan saklar bisukan), opsi mulai otomatis sesi berikutnya, notifikasi browser opt-in, serta perhitungan berbasis timestamp agar tetap akurat saat tab berada di latar atau melewati pergantian hari.
- **Target Fokus Tugas & Daftar Deadline:** formulir tambah tugas (nama tugas, mata kuliah dengan saran otomatis dari daftar yang ada, batas waktu tanggal dan jam opsional) dengan validasi input, edit tugas langsung di daftar, tautkan tugas sebagai target fokus timer untuk mencatat jumlah sesi dan menit fokus per tugas, tandai selesai, pencarian teks, filter status (`Semua`, `Aktif`, `Selesai`) dan filter per mata kuliah, hapus per tugas atau hapus semua yang selesai, pengurutan otomatis dari deadline terdekat, serta pemulihan saat data `localStorage` rusak.
- **Statistik Fokus & Cadangan Lokal:** setiap sesi fokus yang selesai dicatat per hari (dan per mata kuliah bila ditautkan ke tugas) di `localStorage`, lalu ditampilkan sebagai total menit dan sesi minggu berjalan (Senin sampai Minggu), streak hari beruntun, rata-rata menit harian, grafik batang 7 hari terakhir, dan distribusi fokus per mata kuliah. Tersedia pula fitur Ekspor dan Impor cadangan data dalam format JSON, serta dukungan PWA (`manifest.webmanifest` + `sw.js`) untuk penggunaan offline saat disajikan lewat HTTP/HTTPS.
- **Desain dan aksesibilitas:** memakai arah visual Kertas & Tinta Kampus (lihat [DESIGN.md](DESIGN.md)), kontras teks >= 4.5:1, target sentuh minimal 44px, indikator fokus terlihat, container queries, dan tata letak responsif untuk layar ponsel, tablet, dan desktop.

## Struktur file

```text
fokus-kuliah/
  index.html            struktur halaman, timer, daftar deadline, dan statistik fokus
  style.css             tata letak responsif, container queries, tema kertas dan tinta, status komponen
  script.js             logika timer berbasis timestamp, tautan tugas, filter, riwayat fokus, ekspor/impor, dan SW
  manifest.webmanifest  metadata aplikasi web progresif (PWA)
  sw.js                 service worker untuk cache aset inti saat disajikan via HTTP/HTTPS
  icon.svg              ikon aplikasi berbasis SVG
  DESIGN.md             catatan arah desain, dial, palet warna, dan keputusan UI
  README.md             dokumentasi proyek
```

## Sengaja ditunda (bukan bagian MVP)

Sinkron kalender eksternal, akun pengguna, dan tema / dark mode.
