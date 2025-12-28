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
    <div className="max-w-2xl mx-auto py-6 sm:px-6 lg:px-8">
      <div className="px-4 py-6 sm:px-0">
        <div className="mb-6">
          <Link href="/transactions/new" className="text-blue-600 hover:text-blue-500 text-sm mb-4 inline-block">
            ← Back to Add Transaction
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Voice Input</h1>
          <p className="mt-2 text-sm text-gray-600">
            Speak your transaction details
          </p>
        </div>

        <div className="bg-white shadow rounded-lg p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {!parsedTransaction ? (
            <div className="text-center py-8">
              <button
                onClick={recording ? stopRecording : startRecording}
                disabled={processing}
                className={`px-8 py-4 rounded-full text-white font-semibold text-lg ${
                  recording
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {processing
                  ? "Processing..."
                  : recording
                  ? "Stop Recording"
                  : "Start Recording"}
              </button>
              {recording && (
                <p className="mt-4 text-sm text-gray-600">Recording... Click to stop</p>
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

              <div className="border rounded-lg p-4 bg-gray-50">
                <h2 className="font-semibold mb-4">Extracted Transaction Details</h2>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Transaction Type
                    </label>
                    <div className="flex space-x-4">
                      <label className="flex items-center text-gray-900">
                        <input
                          type="radio"
                          value="expense"
                          checked={transactionType === "expense"}
                          onChange={(e) => setTransactionType(e.target.value as "expense" | "income")}
                          className="mr-2"
                        />
                        Expense
                      </label>
                      <label className="flex items-center text-gray-900">
                        <input
                          type="radio"
                          value="income"
                          checked={transactionType === "income"}
                          onChange={(e) => setTransactionType(e.target.value as "expense" | "income")}
                          className="mr-2"
                        />
                        Income
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Amount</label>
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
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Description</label>
                    <input
                      type="text"
                      value={parsedTransaction.description || ""}
                      onChange={(e) =>
                        setParsedTransaction({
                          ...parsedTransaction,
                          description: e.target.value,
                        })
                      }
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Merchant/Vendor</label>
                    <input
                      type="text"
                      value={parsedTransaction.merchant || ""}
                      onChange={(e) =>
                        setParsedTransaction({
                          ...parsedTransaction,
                          merchant: e.target.value,
                        })
                      }
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                      placeholder="Store or vendor name (optional)"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Date</label>
                    <input
                      type="date"
                      value={parsedTransaction.transaction_date}
                      onChange={(e) =>
                        setParsedTransaction({
                          ...parsedTransaction,
                          transaction_date: e.target.value,
                        })
                      }
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Payment Method</label>
                    <select
                      value={paymentMethodId}
                      onChange={(e) => setPaymentMethodId(e.target.value)}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 bg-white text-gray-900 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
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

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setParsedTransaction(null);
                    setTranscription(null);
                    setAudioUrl(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
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
