package ru.apukhtin.budget

import android.graphics.BitmapFactory
import android.util.LruCache
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import java.io.File
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// How a category and a shop are drawn (ios/Budget/CategoryLook.swift): a photo of the server on the category's colour,
// or its icon on a halo of it; the photo is loaded with the access token and kept on the phone.

/**
 * A category as a disc: the photo the user put on it on the category's colour, which shows through a photo with a clear
 * ground, or else its icon in its colour on a halo of it.
 */
@Composable
fun CategoryDisc(icon: String, color: Color, photo: String?, size: Dp = 30.dp) {
    if (photo != null) {
        RemotePhoto(photo, Modifier.size(size).clip(CircleShape).background(color))
    } else {
        Box(Modifier.size(size).background(color.copy(alpha = 0.16f), CircleShape), contentAlignment = Alignment.Center) {
            Icon(WebIcons.icon(icon), contentDescription = null, tint = color, modifier = Modifier.size(size * 0.45f))
        }
    }
}

/** A photo of the server by its path, such as a category's or a shop's logo; until it comes, what is under it shows. */
@Composable
fun RemotePhoto(path: String, modifier: Modifier) {
    val session = LocalSession.current
    var image by remember(path) { mutableStateOf(session.photos.kept(path)) }
    LaunchedEffect(path) {
        if (image == null) image = session.photos.image(path, session.client)
    }
    Box(modifier) {
        image?.let { Image(it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
    }
}

/**
 * Photos already loaded, in memory while the app runs and in files on the phone, for when the server is away. The path
 * carries the photo's version, so a kept one is never stale.
 */
class PhotoCache(private val folder: File) {
    private val images = LruCache<String, ImageBitmap>(200)

    fun kept(path: String): ImageBitmap? = images.get(path)

    suspend fun image(path: String, client: ApiClient?): ImageBitmap? = withContext(Dispatchers.IO) {
        images.get(path)?.let { return@withContext it }
        val file = File(folder, MessageDigest.getInstance("SHA-256").digest(path.toByteArray()).joinToString("") { "%02x".format(it) })
        val data = if (file.exists()) file.readBytes() else runCatching { client?.photo(path) }.getOrNull()?.also {
            folder.mkdirs()
            runCatching { file.writeBytes(it) }
        }
        data?.let { BitmapFactory.decodeByteArray(it, 0, it.size) }?.asImageBitmap()?.also { images.put(path, it) }
    }
}
