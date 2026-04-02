// File: controllers/EtaController.js

const ML_API_URL = "http://145.79.15.182:8000/prediksi";

// Fungsi ini yang akan dipanggil oleh mqttClient
export const getEtaFromML = async (mlPayload) => {
    try {
        const response = await fetch(ML_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(mlPayload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        // Log untuk memastikan jawaban masuk dari FastAPI
        console.log("📞 Jawaban ML:", result);

        // Ambil angka detiknya (sesuaikan dengan key JSON balikan FastAPI kamu)
        return result.eta_detik;

    } catch (error) {
        console.error("❌ Gagal menelepon FastAPI:", error.message);
        return null; // Kembalikan null jika ML mati, agar sistem utama tetap jalan
    }
};