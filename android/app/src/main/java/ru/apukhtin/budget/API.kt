package ru.apukhtin.budget

import java.io.IOException
import java.net.URLEncoder
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import okhttp3.Call
import okhttp3.Callback
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/** What went wrong with a request, in words for the screen. */
sealed class ApiError(message: String) : Exception(message) {
    /** The server wants the access token, or another one. */
    class Unauthorized : ApiError("Сервер не принял токен доступа.")

    /** The form has mistakes, by field, as the server words them. */
    class Invalid(val errors: Map<String, String>) : ApiError(errors.values.sorted().joinToString("\n"))

    class Server(message: String) : ApiError(message)

    /** The server does not answer, or the proxy in front of it says it is down; screens then show what they saved. */
    class Unreachable(message: String) : ApiError(message)
}

/** The server's JSON API: screens are read by GET, and changes post the same forms as the web pages do. */
class ApiClient(
    val base: HttpUrl,
    /** Empty for a server without ACCESS_TOKEN, such as the one on the Mac. */
    val token: String,
    /** Whose phone this is, for the server to say who made a change; empty when the phone has no name. */
    private val who: String = "",
) {
    /** A screen's JSON as the server sent it, to be read and kept. A server silent for 15 seconds counts as gone. */
    suspend fun data(path: String, query: Map<String, String?> = emptyMap()): String {
        val url = url(path).newBuilder().apply {
            query.filterValues { it != null }.toSortedMap().forEach { (name, value) -> addQueryParameter(name, value) }
        }.build()
        return load(request(url).get().build(), quick)
    }

    /** Posts a form; throws [ApiError.Invalid] with what to fix when the server turns it down. Posts wait longer: a sync waits for ZenMoney. */
    suspend fun post(path: String, form: Map<String, String> = emptyMap()) {
        val body = form.toSortedMap().entries.joinToString("&") { (name, value) -> "${encode(name)}=${encode(value)}" }
        val request = request(url(path))
            .post(body.toRequestBody("application/x-www-form-urlencoded; charset=utf-8".toMediaType()))
            .apply { if (who.isNotEmpty()) header("X-Budget-Who", header(who)) }
            .build()
        load(request, patient)
    }

    /** A photo of the server, such as a category's, by its path from the server's JSON. */
    suspend fun photo(path: String): ByteArray {
        val url = base.resolve(path) ?: throw ApiError.Server("Нет такого фото.")
        return withContext(Dispatchers.IO) {
            quick.newCall(request(url).header("Accept", "image/*").build()).await().use { response ->
                if (!response.isSuccessful) throw ApiError.Server("Сервер ответил ошибкой ${response.code}.")
                response.body?.bytes() ?: ByteArray(0)
            }
        }
    }

    private fun url(path: String): HttpUrl = base.newBuilder().addPathSegment("api").addPathSegments(path).build()

    private fun request(url: HttpUrl) = Request.Builder().url(url).header("Accept", "application/json").apply {
        if (token.isNotEmpty()) header("Authorization", "Bearer $token")
    }

    /** Off the main thread, as Android wants every request; the answer is read there too. */
    private suspend fun load(request: Request, client: OkHttpClient): String = withContext(Dispatchers.IO) {
        val call = client.newCall(request)
        try {
            call.await().use { check(it) }
        } catch (error: IOException) {
            if (call.isCanceled()) throw error
            throw ApiError.Unreachable(error.message ?: "Сервер не отвечает.")
        }
    }

    private fun check(response: Response): String {
        val text = response.body?.string().orEmpty()
        if (response.isSuccessful) return text
        if (response.code == 401) throw ApiError.Unauthorized()
        if (response.code in listOf(502, 503, 504)) throw ApiError.Unreachable("Сервер не отвечает (ошибка ${response.code}).")
        val failure = runCatching { ApiJson.decodeFromString(Failure.serializer(), text) }.getOrNull()
        failure?.errors?.let { throw ApiError.Invalid(it) }
        throw ApiError.Server(failure?.error ?: "Сервер ответил ошибкой ${response.code}.")
    }

    @Serializable
    private class Failure(val error: String? = null, val errors: Map<String, String>? = null)

    companion object {
        private val patient = OkHttpClient.Builder().callTimeout(30, TimeUnit.SECONDS).build()
        private val quick = patient.newBuilder().callTimeout(15, TimeUnit.SECONDS).build()

        /** A typed address with https:// added when the scheme is left out. */
        fun url(address: String): HttpUrl? {
            var text = address.trim().trimEnd('/')
            if (text.isEmpty()) return null
            if (!text.contains("://")) text = "https://$text"
            return text.toHttpUrlOrNull()
        }

        /** Percent-encodes a header's value: a header is ASCII, and letters of other alphabets do not pass as they are. */
        private fun header(text: String) = encode(text)

        /** Percent-encodes a form value; `+` and `&` must not pass as they are. */
        private fun encode(text: String) = URLEncoder.encode(text, "UTF-8").replace("+", "%20").replace("*", "%2A").replace("%7E", "~")
    }
}

private suspend fun Call.await(): Response = suspendCancellableCoroutine { continuation ->
    continuation.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onResponse(call: Call, response: Response) = continuation.resumeWith(Result.success(response))

        override fun onFailure(call: Call, e: IOException) = continuation.resumeWithException(e)
    })
}
