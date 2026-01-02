"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import DuplicateDetection from "@/components/DuplicateDetection";

interface ParsedTransaction {
  amount: number;
  description: string | null;
  merchant: string | null;
  category: string | null;
  transaction_date: string;
}

export default function VoiceInputPage() {
  const router = useRouter();
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [parsedTransaction, setParsedTransaction] = useState<ParsedTransaction | null>(null);
  const [processing, setProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [transactionType, setTransactionType] = useState<"expense" | "income">("expense");
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const response = await fetch("/api/payment-methods");
      if (response.ok) {
        const data = await response.json();
        setPaymentMethods(data.paymentMethods || []);
        if (data.paymentMethods?.length > 0) {
          setPaymentMethodId(data.paymentMethods[0].id);
        }
      }
    } catch (err) {
      console.error("Error fetching payment methods:", err);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          
          // Check if we actually captured any audio
          if (audioBlob.size === 0) {
            setError("No audio was recorded. Please try again.");
            stream.getTracks().forEach((track) => track.stop());
            return;
          }

          const url = URL.createObjectURL(audioBlob);
          setAudioUrl(url);

          // Stop all tracks
          stream.getTracks().forEach((track) => track.stop());

          // Process the audio
          await processAudio(audioBlob);
        } catch (err: any) {
          console.error("Error in onstop handler:", err);
          setError("Failed to process recording: " + err.message);
          stream.getTracks().forEach((track) => track.stop());
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
      setError(null);
    } catch (err: any) {
      setError("Failed to start recording: " + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      try {
        // Request any remaining data before stopping
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.requestData();
        }
        mediaRecorderRef.current.stop();
        setRecording(false);
      } catch (err: any) {
        console.error("Error stopping recording:", err);
        setError("Failed to stop recording: " + err.message);
        setRecording(false);
      }
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    setProcessing(true);
    setError(null);

    try {
      console.log("Processing audio blob, size:", audioBlob.size);
      
      // Send audio directly to OpenAI transcription API (no need to store in Supabase)
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.webm");

      console.log("Sending request to /api/openai/transcribe");
      
      // Transcribe and parse
      const response = await fetch("/api/openai/transcribe", {
        method: "POST",
        body: formData,
      });

      console.log("Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || "Failed to transcribe audio" };
        }
        console.error("API error:", errorData);
        throw new Error(errorData.error || "Failed to transcribe audio");
      }

      const data = await response.json();
      console.log("Received transcription data:", data);
      
      setTranscription(data.transcription);
      if (data.transaction) {
        setParsedTransaction(data.transaction);
      } else {
        setError("Could not extract transaction details from audio. Please try again or enter manually.");
      }
    } catch (err: any) {
      console.error("Error processing audio:", err);
      setError(err.message || "Failed to process audio");
    } finally {
      setProcessing(false);
    }
  };

  const handleSave = async () => {
    if (!parsedTransaction || !paymentMethodId) {
      setError("Missing required fields");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Calculate final amount based on transaction type (expense = negative, income = positive)
      const amountValue = Math.abs(parsedTransaction.amount);
      const finalAmount = transactionType === "expense" ? -amountValue : amountValue;

      const response = await fetch("/api/transactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payment_method_id: paymentMethodId,
          amount: finalAmount,
          description: parsedTransaction.description,
          merchant: parsedTransaction.merchant,
          category: parsedTransaction.category,
          transaction_date: parsedTransaction.transaction_date,
          source: "voice",
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save transaction");
      }

      router.push("/transactions");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-4 sm:py-6 px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link href="/transactions/new" className="text-blue-600 hover:text-blue-500 text-sm mb-4 inline-block">
          ← Back to Add Transaction
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Voice Input</h1>
        <p className="mt-2 text-sm text-gray-600">
          Speak your transaction details
        </p>
      </div>

      <div className="bg-white shadow rounded-lg p-4 sm:p-6 space-y-5 sm:space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {!parsedTransaction ? (
            <div className="text-center py-8 sm:py-12">
              <button
                onClick={recording ? stopRecording : startRecording}
                disabled={processing}
                className={`w-full sm:w-auto px-8 py-4 sm:py-5 rounded-full text-white font-semibold text-base sm:text-lg shadow-lg transition-all ${
                  recording
                    ? "bg-red-600 hover:bg-red-700 active:bg-red-800"
                    : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {processing
                  ? "Processing..."
                  : recording
                  ? "Stop Recording"
                  : "Start Recording"}
              </button>
              {recording && (
                <p className="mt-4 text-sm text-gray-600">Recording... Tap to stop</p>
              )}
            </div>
          ) : (
            <>
              {transcription && (
                <div className="border rounded-lg p-4 bg-gray-50">
                  <h3 className="font-semibold mb-2">Transcription:</h3>
                  <p className="text-sm text-gray-700">{transcription}</p>
                </div>
              )}

              <div className="border rounded-lg p-4 sm:p-5 bg-gray-50">
                <h2 className="font-semibold mb-4 text-lg">Extracted Transaction Details</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Transaction Type
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={`flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                        transactionType === "expense"
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}>
                        <input
                          type="radio"
                          value="expense"
                          checked={transactionType === "expense"}
                          onChange={(e) => setTransactionType(e.target.value as "expense" | "income")}
                          className="sr-only"
                        />
                        <span className="font-medium">Expense</span>
                      </label>
                      <label className={`flex items-center justify-center p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                        transactionType === "income"
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}>
                        <input
                          type="radio"
                          value="income"
                          checked={transactionType === "income"}
                          onChange={(e) => setTransactionType(e.target.value as "expense" | "income")}
                          className="sr-only"
                        />
                        <span className="font-medium">Income</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={parsedTransaction.amount || ""}
                      onChange={(e) =>
                        setParsedTransaction({
                          ...parsedTransaction,
                          amount: parseFloat(e.target.value),
                        })
                      }
                      className="block w-full px-4 py-3 text-base border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                    <input
                      type="text"
                      value={parsedTransaction.description || ""}
                      onChange={(e) =>
                        setParsedTransaction({
                          ...parsedTransaction,
                          description: e.target.value,
                        })
                      }
                      className="block w-full px-4 py-3 text-base border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Merchant/Vendor</label>
                    <input
                      type="text"
                      value={parsedTransaction.merchant || ""}
                      onChange={(e) =>
                        setParsedTransaction({
                          ...parsedTransaction,
                          merchant: e.target.value,
                        })
                      }
                      className="block w-full px-4 py-3 text-base border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Store or vendor name (optional)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Date</label>
                    <input
                      type="date"
                      value={parsedTransaction.transaction_date}
                      onChange={(e) =>
                        setParsedTransaction({
                          ...parsedTransaction,
                          transaction_date: e.target.value,
                        })
                      }
                      className="block w-full px-4 py-3 text-base border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
                    <select
                      value={paymentMethodId}
                      onChange={(e) => setPaymentMethodId(e.target.value)}
                      className="block w-full px-4 py-3 text-base border border-gray-300 bg-white text-gray-900 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      {paymentMethods.map((pm) => (
                        <option key={pm.id} value={pm.id}>
                          {pm.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {paymentMethodId && parsedTransaction.amount && parsedTransaction.transaction_date && (
                <DuplicateDetection
                  amount={parsedTransaction.amount}
                  transactionDate={parsedTransaction.transaction_date}
                  paymentMethodId={paymentMethodId}
                />
              )}

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    setParsedTransaction(null);
                    setTranscription(null);
                    setAudioUrl(null);
                  }}
                  className="w-full sm:w-auto px-4 py-3 text-center border border-gray-300 rounded-lg shadow-sm text-base font-medium text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="w-full sm:w-auto px-4 py-3 border border-transparent rounded-lg shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 active:bg-blue-800 transition-colors"
                >
                  {saving ? "Saving..." : "Save Transaction"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
