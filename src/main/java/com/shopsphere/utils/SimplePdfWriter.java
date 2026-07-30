package com.shopsphere.utils;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

public class SimplePdfWriter {
    private final ByteArrayOutputStream bos = new ByteArrayOutputStream();
    private final List<Long> offsets = new ArrayList<>();
    private final List<String> objects = new ArrayList<>();

    public SimplePdfWriter() {
        writeRaw("%PDF-1.4\n");
    }

    private void writeRaw(String s) {
        try {
            bos.write(s.getBytes(StandardCharsets.ISO_8859_1));
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
    }

    public static String escapePdfText(String text) {
        if (text == null) return "";
        // Clean special characters and map Rupee (₹) to INR/Rs.
        String cleanText = text.replace("₹", "Rs. ")
                               .replace("Rs.", "Rs.")
                               .replace("(", "\\(")
                               .replace(")", "\\)");
        
        // Remove standard non-ASCII chars to prevent PDF text encoding glitches
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < cleanText.length(); i++) {
            char c = cleanText.charAt(i);
            if (c < 128) {
                sb.append(c);
            } else {
                sb.append(" ");
            }
        }
        return sb.toString();
    }

    public byte[] build(String contentStream) {
        int catalogId = 1;
        int pagesId = 2;
        int pageId = 3;
        int fontId = 4;
        int contentId = 5;

        // Content stream binary data
        byte[] streamBytes = contentStream.getBytes(StandardCharsets.ISO_8859_1);
        String contentObj = "<< /Length " + streamBytes.length + " >>\nstream\n" + contentStream + "\nendstream\n";

        List<String> allObjects = new ArrayList<>();
        allObjects.add("<< /Type /Catalog /Pages 2 0 R >>\n");
        allObjects.add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>\n");
        allObjects.add("<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 595.27 841.89] /Contents 5 0 R >>\n");
        allObjects.add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\n");
        allObjects.add(contentObj);

        // Write objects and track offsets
        long currentOffset = 9; // length of "%PDF-1.4\n"
        
        for (int i = 0; i < allObjects.size(); i++) {
            offsets.add(currentOffset);
            String prefix = (i + 1) + " 0 obj\n";
            String suffix = "endobj\n";
            writeRaw(prefix);
            writeRaw(allObjects.get(i));
            writeRaw(suffix);
            currentOffset += prefix.length() + allObjects.get(i).length() + suffix.length();
        }

        long xrefOffset = currentOffset;
        writeRaw("xref\n");
        writeRaw("0 " + (allObjects.size() + 1) + "\n");
        writeRaw("0000000000 65535 f \n");
        for (int i = 0; i < offsets.size(); i++) {
            writeRaw(String.format("%010d 00000 n \n", offsets.get(i)));
        }

        writeRaw("trailer\n");
        writeRaw("<< /Size " + (allObjects.size() + 1) + " /Root 1 0 R >>\n");
        writeRaw("startxref\n");
        writeRaw(xrefOffset + "\n");
        writeRaw("%%EOF\n");

        return bos.toByteArray();
    }
}
