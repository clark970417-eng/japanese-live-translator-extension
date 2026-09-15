# v3.3.4 verification: caption expiry and slow translation

Generated captions receive an explicit expiry time. Repeated output from the same audio segment does not extend the deadline, while the same words spoken in a later segment remain valid. Native YouTube captions retain their own cue timing.

The fast translation path starts first. When configured, a fallback provider may start after 400 ms; the first valid result wins, with a three-second request deadline for low-latency mode. This improves recovery under network variance but does not guarantee recognition or translation latency.

The automated suite passed 33 tests, including expiry, repeated speech, late-result rejection, and native-caption clearing.
