# Spike C1: NVDA Controller Client DLL via koffi

Question: does `nvdaController_speakText` speak through NVDA from Node?

Evidence: NVDA is not installed on this machine; the user skipped C1. The automated run only confirmed `nvdaSpeak` loads the DLL and returns 1722 (RPC server unavailable), the expected no-NVDA result.

Result: NOT RUN (end-to-end). DLL load verified only. Route defaults to agent-voice only until tested with NVDA.
