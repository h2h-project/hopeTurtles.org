"""Translations for the carpenter-sheet PDFs of the rear fin, ballast, head fin
and sail apparatus (the 6FC Ecojoiner sheet keeps its own keyed table,
objects/ecojoiner_6fc.py::PDF_STRINGS).

Strings are keyed by their English template, so a writer reads naturally:

    L = translator(inputs)
    L("Bottle diameter: {v}mm", v=84)

A template missing from STRINGS, or a language missing from its entry, falls
back to English, so an untranslated line can never break a sheet. Units (mm),
bolt callouts (M3/M5/M6), the ⌀ sign and file formats (SVG/DXF) are not
translated. SVG/DXF part labels stay English everywhere (they are machine
layer names, as on the 6FC exports); only the PDF is localised.

Where the 6FC sheet already translates a phrase ("Input variables",
"Bottle diameter", the fit-connection names), the same wording is used here.
The Indonesian and Turkish text was written without a native-speaker review.
"""
from __future__ import annotations

from typing import Callable, Dict

SUPPORTED_PDF_LANGS = ("en", "id", "tr")

# Arvo (the title font) has no glyphs for Turkish ş/ğ/İ -- same rule as
# objects/ecojoiner_6fc.py::TITLE_FONT_UNSUPPORTED_LANGS.
TITLE_FONT_UNSUPPORTED_LANGS = {"tr"}


def pdf_lang(inputs) -> str:
    lang = (getattr(inputs, "lang", "en") or "en").lower()
    return lang if lang in SUPPORTED_PDF_LANGS else "en"


def title_font_for(lang: str, title_font: str, body_font: str) -> str:
    return body_font if lang in TITLE_FONT_UNSUPPORTED_LANGS else title_font


STRINGS: Dict[str, Dict[str, str]] = {
    # ---- shared sheet furniture -------------------------------------------
    "Reference sheet only - the SVG/DXF exports are the 1:1 cut files.": {
        "id": "Hanya lembar referensi - file SVG/DXF adalah file potong skala 1:1.",
        "tr": "Yalnızca referans sayfası - SVG/DXF dosyaları 1:1 kesim dosyalarıdır.",
    },
    "Reference sheet only - the SVG/DXF exports are the 1:1 cut files. Experimental: not yet sea-tested.": {
        "id": "Hanya lembar referensi - file SVG/DXF adalah file potong skala 1:1. Eksperimental: belum diuji di laut.",
        "tr": "Yalnızca referans sayfası - SVG/DXF dosyaları 1:1 kesim dosyalarıdır. Deneysel: henüz denizde denenmedi.",
    },
    "Ruler: +above / -below bottle-axis zero (mm). Engrave BOTH faces 0.3 mm; ENGRAVE paths are not cuts.": {
        "id": "Penggaris: + di atas / - di bawah nol sumbu botol (mm). Ukir KEDUA sisi 0,3 mm; jalur ENGRAVE bukan garis potong.",
        "tr": "Cetvel: şişe ekseni sıfırının + üstü / - altı (mm). HER İKİ yüzü 0,3 mm kazıyın; ENGRAVE yolları kesim değildir.",
    },
    "Input variables": {"id": "Variabel input", "tr": "Girdi değişkenleri"},
    "Derived dimensions": {"id": "Dimensi turunan", "tr": "Türetilmiş ölçüler"},
    "CERN-OHL-S-2.0. Design version {version}. https://hopeturtles.org/turtles/generate": {
        "id": "CERN-OHL-S-2.0. Versi desain {version}. https://hopeturtles.org/turtles/generate",
        "tr": "CERN-OHL-S-2.0. Tasarım sürümü {version}. https://hopeturtles.org/turtles/generate",
    },
    # ---- input lines -------------------------------------------------------
    "Wood thickness: {v}mm": {"id": "Ketebalan kayu: {v}mm", "tr": "Ahşap kalınlığı: {v}mm"},
    "Bottle diameter: {v}mm": {"id": "Diameter botol: {v}mm", "tr": "Şişe çapı: {v}mm"},
    "Bottle height: {v}mm": {"id": "Tinggi botol: {v}mm", "tr": "Şişe yüksekliği: {v}mm"},
    "Cap diameter: {v}mm": {"id": "Diameter tutup: {v}mm", "tr": "Kapak çapı: {v}mm"},
    "Cap height: {v}mm": {"id": "Tinggi tutup: {v}mm", "tr": "Kapak yüksekliği: {v}mm"},
    "Board width: {v}mm": {"id": "Lebar papan: {v}mm", "tr": "Tahta genişliği: {v}mm"},
    "Fit connection: {v}": {"id": "Kekencangan sambungan: {v}", "tr": "Bağlantı sıkılığı: {v}"},
    # ---- drawing callouts ---------------------------------------------------
    "{v}mm deep": {"id": "dalam {v}mm", "tr": "{v}mm derin"},
    "{v}mm wide": {"id": "lebar {v}mm", "tr": "{v}mm geniş"},
    "{v}mm from rear": {"id": "{v}mm dari belakang", "tr": "arkadan {v}mm"},
    "{v}mm flat": {"id": "datar {v}mm", "tr": "{v}mm düz"},
    "clamp {d}": {"id": "penjepit {d}", "tr": "kelepçe {d}"},
    "lock {d}": {"id": "pengunci {d}", "tr": "kilit {d}"},
    "Ø{v} shaft": {"id": "Ø{v} poros", "tr": "Ø{v} mil"},
    # ---- rear fin ------------------------------------------------------------
    "Flatpack Back Fin v{version}": {
        "id": "Sirip Belakang Flatpack v{version}",
        "tr": "Düz Paket Arka Yüzgeç v{version}",
    },
    "Bottle Holder Shaft (x2)": {"id": "Batang Penahan Botol (x2)", "tr": "Şişe Tutucu Çubuk (x2)"},
    "Rear Fin": {"id": "Sirip Belakang", "tr": "Arka Yüzgeç"},
    "Solar Panel Holder": {"id": "Penahan Panel Surya", "tr": "Güneş Paneli Tutucu"},
    "Front Solar Holder": {"id": "Penahan Depan Panel Surya", "tr": "Ön Güneş Paneli Tutucu"},
    "2x M3 pilot {d}": {"id": "2x lubang pandu M3 {d}", "tr": "2x M3 kılavuz deliği {d}"},
    "2x {d} drilled DOWN from the top edge,": {"id": "2x {d} dibor KE BAWAH dari tepi atas,", "tr": "2x {d} üst kenardan AŞAĞI delinir,"},
    "{v}mm either side of centre,": {"id": "{v}mm di kedua sisi tengah,", "tr": "merkezin her iki yanında {v}mm,"},
    "counterbore {d} x {v}mm deep.": {"id": "lubang benam {d} x {v}mm.", "tr": "havşa {d} x {v}mm derinlik."},
    "M3 x {v} screws into the shaft.": {"id": "sekrup M3 x {v} ke batang.", "tr": "M3 x {v} vida çubuğa."},
    "Panel front corners: M3 into the legs.": {"id": "Sudut depan panel: M3 ke kaki.", "tr": "Panel ön köşeleri: M3 ayaklara."},
    "Front holder pilots from front: {v}mm": {"id": "Lubang pandu penahan depan dari depan: {v}mm", "tr": "Ön tutucu kılavuzları önden: {v}mm"},
    "Fin: {w} x {h}mm": {"id": "Sirip: {w} x {h}mm", "tr": "Yüzgeç: {w} x {h}mm"},
    "Shaft length: {v}mm": {"id": "Panjang batang: {v}mm", "tr": "Çubuk uzunluğu: {v}mm"},
    "Joint slot opening: {v}mm": {"id": "Bukaan slot sambungan: {v}mm", "tr": "Geçme yuvası eni: {v}mm"},
    "Solar slot width: {v}mm": {"id": "Lebar slot surya: {v}mm", "tr": "Güneş yuvası eni: {v}mm"},
    "Panel: {w} x {h} x {t}mm": {"id": "Panel: {w} x {h} x {t}mm", "tr": "Panel: {w} x {h} x {t}mm"},
    "Clamp hole from front: {v}mm": {"id": "Lubang penjepit dari depan: {v}mm", "tr": "Kelepçe deliği önden: {v}mm"},
    "Collar lock from front: {v}mm": {"id": "Pengunci leher dari depan: {v}mm", "tr": "Boyun kilidi önden: {v}mm"},
    # ---- ballast -------------------------------------------------------------
    "Flatpack Bottom Ballast Fin v{version}": {
        "id": "Sirip Pemberat Bawah Flatpack v{version}",
        "tr": "Düz Paket Alt Safra Yüzgeci v{version}",
    },
    "Core Slat (x2)": {"id": "Bilah Inti (x2)", "tr": "Ana Lata (x2)"},
    "Ballast Bottom Board": {"id": "Papan Dasar Pemberat", "tr": "Safra Alt Tahtası"},
    "Bottom Ballast Fin": {"id": "Sirip Pemberat Bawah", "tr": "Alt Safra Yüzgeci"},
    "Ballast Lock Foot (x2)": {"id": "Kaki Pengunci Pemberat (x2)", "tr": "Safra Kilit Ayağı (x2)"},
    "Port length: {v}mm": {"id": "Panjang port: {v}mm", "tr": "Port uzunluğu: {v}mm"},
    "Core slat: {w} x {h}mm": {"id": "Bilah inti: {w} x {h}mm", "tr": "Ana lata: {w} x {h}mm"},
    "Board: {w} x {h}mm": {"id": "Papan: {w} x {h}mm", "tr": "Tahta: {w} x {h}mm"},
    "Lock foot: {w} x {h}mm": {"id": "Kaki pengunci: {w} x {h}mm", "tr": "Kilit ayağı: {w} x {h}mm"},
    "Slat clamp hole from top: {v}mm": {"id": "Lubang penjepit bilah dari atas: {v}mm", "tr": "Lata kelepçe deliği üstten: {v}mm"},
    "Slat collar lock from top: {v}mm": {"id": "Pengunci leher bilah dari atas: {v}mm", "tr": "Lata boyun kilidi üstten: {v}mm"},
    # ---- head fin ------------------------------------------------------------
    "Flatpack Head Fin v{version}": {
        "id": "Sirip Depan Flatpack v{version}",
        "tr": "Düz Paket Ön Yüzgeç v{version}",
    },
    "Head Fin Slat (x2)": {"id": "Bilah Sirip Depan (x2)", "tr": "Ön Yüzgeç Latası (x2)"},
    "Head Fin": {"id": "Sirip Depan", "tr": "Ön Yüzgeç"},
    "Slat: {w} x {h}mm": {"id": "Bilah: {w} x {h}mm", "tr": "Lata: {w} x {h}mm"},
    "Half-lap engagement: {v}mm": {"id": "Kedalaman sambungan tumpang: {v}mm", "tr": "Yarım geçme derinliği: {v}mm"},
    "Clamp hole from slat front: {v}mm": {"id": "Lubang penjepit dari depan bilah: {v}mm", "tr": "Kelepçe deliği lata önünden: {v}mm"},
    "Collar lock from slat front: {v}mm": {"id": "Pengunci leher dari depan bilah: {v}mm", "tr": "Boyun kilidi lata önünden: {v}mm"},
    # ---- sail apparatus -------------------------------------------------------
    "Flatpack Sail Apparatus v{version}": {
        "id": "Perangkat Layar Flatpack v{version}",
        "tr": "Düz Paket Yelken Düzeneği v{version}",
    },
    "Top Sail Bar Half (x2)": {"id": "Separuh Palang Layar Atas (x2)", "tr": "Üst Yelken Çubuğu Yarısı (x2)"},
    "Sail Crossbar Connector (x1)": {"id": "Penyambung Palang Layar (x1)", "tr": "Yelken Çapraz Çubuk Bağlantısı (x1)"},
    "Bottom Sail Bar (x2)": {"id": "Palang Layar Bawah (x2)", "tr": "Alt Yelken Çubuğu (x2)"},
    "Sail Batten (x2)": {"id": "Reng Layar (x2)", "tr": "Yelken Latası (x2)"},
    "Non-sail Batten (x2)": {"id": "Reng Non-layar (x2)", "tr": "Yelkensiz Lata (x2)"},
    "Joint Strengthener (x2)": {"id": "Penguat Sambungan (x2)", "tr": "Bağlantı Güçlendirici (x2)"},
    "C End Piece (x2)": {"id": "Potongan Ujung C (x2)", "tr": "C Uç Parçası (x2)"},
    "Wood thickness {t}mm   Bottle Ø {d}mm": {
        "id": "Ketebalan kayu {t}mm   Botol Ø {d}mm",
        "tr": "Ahşap kalınlığı {t}mm   Şişe Ø {d}mm",
    },
    "Battens {s} (sail) / {n} (non-sail) x {w} x {t}mm": {
        "id": "Reng {s} (layar) / {n} (non-layar) x {w} x {t}mm",
        "tr": "Latalar {s} (yelken) / {n} (yelkensiz) x {w} x {t}mm",
    },
    "Rail slots {v}mm wide (fit the batten)": {
        "id": "Slot rel lebar {v}mm (pas dengan reng)",
        "tr": "Ray yuvaları {v}mm geniş (lataya oturur)",
    },
    "Batten notches {r}mm (rails), {c}mm (crossbar: 2 layers)": {
        "id": "Takik reng {r}mm (rel), {c}mm (palang: 2 lapis)",
        "tr": "Lata çentikleri {r}mm (raylar), {c}mm (çapraz çubuk: 2 kat)",
    },
    "Top bar halves {l} x {w}mm, {tt}mm tip to tip": {
        "id": "Separuh palang atas {l} x {w}mm, {tt}mm ujung ke ujung",
        "tr": "Üst çubuk yarıları {l} x {w}mm, uçtan uca {tt}mm",
    },
    "Connector {l}mm: shaft hole Ø{a}, M3 side pilot Ø{p} to it": {
        "id": "Penyambung {l}mm: lubang poros Ø{a}, pandu samping M3 Ø{p}",
        "tr": "Bağlantı {l}mm: mil deliği Ø{a}, mile M3 yan kılavuz Ø{p}",
    },
    "Bottom sail bar {l} x {w}mm": {"id": "Palang layar bawah {l} x {w}mm", "tr": "Alt yelken çubuğu {l} x {w}mm"},
    "Joint strengthener {w} x {h}mm": {"id": "Penguat sambungan {w} x {h}mm", "tr": "Bağlantı güçlendirici {w} x {h}mm"},
    "C end piece {l} x {w}mm": {"id": "Potongan ujung C {l} x {w}mm", "tr": "C uç parçası {l} x {w}mm"},
    "Cage holes M3 Ø{d} @ {lo}/{up}mm from foot": {
        "id": "Lubang sangkar M3 Ø{d} @ {lo}/{up}mm dari kaki",
        "tr": "Kafes delikleri M3 Ø{d} @ alttan {lo}/{up}mm",
    },
    "Strengthener/batten M6 Ø{v}mm": {"id": "Penguat/reng M6 Ø{v}mm", "tr": "Güçlendirici/lata M6 Ø{v}mm"},
    "Reference only - the SVG/DXF exports are the 1:1 cut files. One shared scale; mirrored "
    "pairs are drawn once. Positions are in mm from the nearest end of the part, and M3/M6 "
    "name the bolt each hole takes. Every part, battens included, is cut from "
    "your {t}mm board. The sail is soft goods and is not on this sheet.": {
        "id": "Hanya referensi - file SVG/DXF adalah file potong skala 1:1. Satu skala bersama; "
              "pasangan cermin digambar sekali. Posisi dalam mm dari ujung bagian yang terdekat, dan "
              "M3/M6 menunjukkan baut untuk tiap lubang. Semua bagian, termasuk reng, dipotong dari "
              "papan {t}mm Anda. Layar terbuat dari kain dan tidak ada di lembar ini.",
        "tr": "Yalnızca referans - SVG/DXF dosyaları 1:1 kesim dosyalarıdır. Tek ortak ölçek; ayna "
              "çiftler bir kez çizilir. Konumlar parçanın en yakın ucundan mm cinsindendir ve M3/M6 "
              "her deliğe giren cıvatayı belirtir. Latalar dahil her parça {t}mm tahtanızdan kesilir. "
              "Yelken kumaştır ve bu sayfada yer almaz.",
    },
}


def tr(lang: str, template: str, **kwargs) -> str:
    """`template` in `lang` (English fallback), formatted with `kwargs`."""
    text = STRINGS.get(template, {}).get(lang) or template
    return text.format(**kwargs) if kwargs else text


def translator(inputs) -> Callable[..., str]:
    lang = pdf_lang(inputs)
    return lambda template, **kwargs: tr(lang, template, **kwargs)
