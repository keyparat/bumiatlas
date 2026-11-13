# BumiAtlas Local Connector (Windows)

Connector ini menjalankan layanan WMS di komputer Windows Anda. Browser Chromium khusus dibuka untuk login ATR/BPN secara manual. Profil browser disimpan lokal di folder `.atrbpn-browser-profile` dan tidak masuk Git.

## Persyaratan

- Windows 10/11
- Node.js 20 atau lebih baru
- Koneksi internet dan akses ATR/BPN dari jaringan komputer Anda

## Menjalankan

1. Unduh ZIP repository dari branch `feature/windows-local-atr-connector`, atau clone repository.
2. Buka folder `local-connector`.
3. Klik dua kali `start.bat`.
4. Tunggu instalasi pertama selesai dan browser Chromium terbuka.
5. Login ATR/BPN secara manual pada browser tersebut. Jangan kirim password, OTP, atau cookie kepada siapa pun.
6. Setelah login selesai, kembali ke jendela terminal Connector dan tekan ENTER.
7. Tunggu pesan `BERHASIL: sesi WMS terverifikasi`.
8. Biarkan jendela Connector dan browser tetap terbuka saat menggunakan layer ATR/BPN di BumiAtlas.

## Pemeriksaan

Buka alamat berikut di browser komputer yang sama:

- `http://127.0.0.1:8765/health`

Hasil yang diharapkan memuat `"atrbpnSessionReady":true`.

Connector hanya bind ke `127.0.0.1`, memeriksa origin BumiAtlas, dan hanya meneruskan enam nama layer yang diizinkan. Data login tetap berada di profil Chromium lokal. Jangan bagikan folder `.atrbpn-browser-profile`.

## Catatan

Ini adalah uji integrasi lokal. Keberhasilan login belum otomatis membuktikan semua layer dapat ditampilkan. Uji tile akan dilakukan dari BumiAtlas setelah status sesi siap. Jika ATR/BPN mengubah autentikasi, alamat WMS, atau kebijakan akses, Connector mungkin perlu disesuaikan.
