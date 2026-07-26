import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

// Configure virtual file system fonts for pdfMake to support Croatian diacritics (č, ć, š, ž, đ)
if (pdfMake && pdfFonts) {
    const vfs = (pdfFonts as any).pdfMake ? (pdfFonts as any).pdfMake.vfs : (pdfFonts as any).vfs;
    (pdfMake as any).vfs = vfs;
}

export default pdfMake;
